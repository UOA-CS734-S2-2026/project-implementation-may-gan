import { readFile } from "node:fs/promises";
import postgres from "postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createAppForEnv } from "../../../apps/api/src/app";
import { importUsersAndAccounts } from "./users-import";

const migratorUrl = process.env.TEST_DATABASE_URL;
const hasTestDatabaseConfig = Boolean(migratorUrl);
const legacyPasswordHash = "04cce2fc3f1f3cfc1595141a06356fce:6af24056d433001f3186cb668902c5b9fde1e52c94f5eea265043a07ec2843265620e85b650c9a358034c7cfa9c03335883d5653eff16b4a35615469de9f1fab";
const origin = "https://api.example.test";

function requireLocalTestUrl(value: string | undefined): string {
  if (!value) throw new Error("TEST_DATABASE_URL is required for users and accounts import integration tests.");
  const url = new URL(value);
  if (url.hostname !== "localhost" || url.port !== "5433" || url.pathname !== "/dayli_test") throw new Error("TEST_DATABASE_URL must target localhost:5433/dayli_test.");
  return value;
}

const profileColumns = "id, name, username, display_username, bio, mbti, what_i_do, listening_to, profile_visibility, email, email_verified, image, created_at, updated_at, tier, role, banned, ban_reason, ban_expires";

(hasTestDatabaseConfig ? describe : describe.skip)("isolated direct users and accounts import", () => {
  const connection = hasTestDatabaseConfig
    ? requireLocalTestUrl(migratorUrl)
    : "postgresql://migrator:migrator@localhost:5433/dayli_test";
  const admin = postgres(connection, { max: 1, prepare: false, onnotice: () => undefined });
  const source = postgres(connection, { max: 1, prepare: false, onnotice: () => undefined });
  const target = postgres("postgresql://users_accounts_importer:users_accounts_importer@localhost:5433/dayli_test", { max: 1, prepare: false, onnotice: () => undefined });

  async function insertSourceUser(id: string, email: string, username: string | null = `${id}_name`): Promise<void> {
    await admin.unsafe(`insert into legacy_source."user" (${profileColumns}) values
      ('${id}', 'Name ${id}', ${username === null ? "null" : `'${username}'`}, 'Display ${id}', 'Bio ${id}', 'INTJ', 'Engineer', 'Music',
       'private', '${email}', true, 'https://image.example.test/${id}', '2025-01-02 03:04:05', '2025-02-03 04:05:06', 'pro', 'member', false, null, null)`);
  }

  async function seedSource(): Promise<void> {
    for (const fixtureId of ["seed_user_alice", "seed_user_bob", "seed_user_carol"]) await insertSourceUser(fixtureId, `${fixtureId}@example.test`);
    await insertSourceUser("legacy-user-one", "one@example.test", "legacy_one");
    await insertSourceUser("legacy-user-two", "two@example.test", "legacy_two");
    await admin.unsafe(`insert into legacy_source.account (id, account_id, provider_id, user_id, access_token, refresh_token, id_token, access_token_expires_at, refresh_token_expires_at, scope, password, created_at, updated_at) values
      ('legacy-credential-one', 'legacy-user-one', 'credential', 'legacy-user-one', null, null, null, null, null, null, '${legacyPasswordHash}', '2025-01-02 03:04:05', '2025-02-03 04:05:06'),
      ('legacy-google-one', 'google-subject-one', 'google', 'legacy-user-one', 'source-access-token', 'source-refresh-token', 'source-id-token', '2025-03-01 00:00:00', '2025-04-01 00:00:00', 'openid email', null, '2025-01-02 03:04:05', '2025-02-03 04:05:06'),
      ('legacy-credential-two', 'legacy-user-two', 'credential', 'legacy-user-two', null, null, null, null, null, null, '${legacyPasswordHash}', '2025-01-02 03:04:05', '2025-02-03 04:05:06')`);
  }

  beforeAll(async () => {
    await admin.unsafe("drop schema if exists legacy_source cascade");
    await admin.unsafe('drop table if exists public.account, public.session, public.verification, public."user" cascade');
    await admin.unsafe("drop type if exists public.profile_visibility, public.tier cascade");
    await admin.unsafe(await readFile(new URL("../migrations/0001_better_auth_postgres.sql", import.meta.url), "utf8"));
    await admin.unsafe("create schema legacy_source");
    await admin.unsafe("create type legacy_source.profile_visibility as enum ('public', 'private')");
    await admin.unsafe("create type legacy_source.tier as enum ('free', 'pro')");
    await admin.unsafe(`create table legacy_source."user" (
      id text primary key not null, name text not null, username text unique not null, display_username text, bio text, mbti text, what_i_do text, listening_to text,
      profile_visibility legacy_source.profile_visibility not null, email text not null unique, email_verified boolean not null, image text,
      created_at timestamp not null, updated_at timestamp not null, tier legacy_source.tier not null, role text, banned boolean, ban_reason text, ban_expires timestamp)`);
    await admin.unsafe(`create table legacy_source.account (
      id text primary key not null, account_id text not null, provider_id text not null, user_id text not null references legacy_source."user"(id),
      access_token text, refresh_token text, id_token text, access_token_expires_at timestamp, refresh_token_expires_at timestamp, scope text, password text,
      created_at timestamp not null, updated_at timestamp not null)`);
    await admin.unsafe("grant usage on schema legacy_source to legacy_users_accounts_reader");
    await admin.unsafe('grant select on legacy_source."user", legacy_source.account to legacy_users_accounts_reader');
    await admin.unsafe('grant select, insert on public."user", public.account to users_accounts_importer');
    await source`set role legacy_users_accounts_reader`;
  });

  beforeEach(async () => {
    await admin.unsafe("drop trigger if exists users_accounts_import_rollback_probe on public.account");
    await admin.unsafe("drop function if exists public.users_accounts_import_rollback_probe()");
    await admin.unsafe('truncate table legacy_source.account, legacy_source."user" cascade');
    await admin.unsafe('truncate table public.account, public.session, public.verification, public."user" cascade');
    await seedSource();
  });

  afterAll(async () => {
    await source`reset role`;
    await admin.unsafe("drop schema if exists legacy_source cascade");
    await admin.end({ timeout: 5 });
    await source.end({ timeout: 5 });
    await target.end({ timeout: 5 });
  });

  it("uses a SELECT-only source role and a dry run makes no target writes or sensitive logs", async () => {
    const result = await importUsersAndAccounts(source, target, { apply: false, sourceSchema: "legacy_source" });
    expect(result).toMatchObject({ mode: "dry-run", status: "ready", sourceUsers: "2", sourceAccounts: "3", excludedFixtures: "3", insertedUsers: "0", insertedAccounts: "0" });
    expect(JSON.stringify(result)).not.toContain("token");
    expect(JSON.stringify(result)).not.toContain(legacyPasswordHash);
    await expect(source`insert into legacy_source."user" (id, name, profile_visibility, email, email_verified, created_at, updated_at, tier) values ('denied', 'Denied', 'public', 'denied@example.test', false, now(), now(), 'free')`).rejects.toThrow();
    await expect(source`update legacy_source.account set password = null`).rejects.toThrow();
    const [{ users, accounts }] = await admin`select (select count(*)::text from public."user") as users, (select count(*)::text from public.account) as accounts`;
    expect({ users, accounts }).toEqual({ users: "0", accounts: "0" });
  });

  it("preserves profiles, stable IDs, account mappings, compatible password hashes, and no tokens or sessions", async () => {
    const [sourceProfile] = await source`select created_at::text, updated_at::text from legacy_source."user" where id = 'legacy-user-one'`;
    expect(sourceProfile).toEqual({ created_at: "2025-01-02 03:04:05", updated_at: "2025-02-03 04:05:06" });
    const result = await importUsersAndAccounts(source, target, { apply: true, sourceSchema: "legacy_source" });
    expect(result).toMatchObject({ mode: "apply", status: "applied", sourceUsers: "2", sourceAccounts: "3", insertedUsers: "2", insertedAccounts: "3" });
    const [profile] = await admin`select id, username, display_username, bio, mbti, what_i_do, listening_to, profile_visibility, email, email_verified, image, created_at::text as created_at, updated_at::text as updated_at, tier, role, banned, ban_reason, ban_expires::text as ban_expires from public."user" where id = 'legacy-user-one'`;
    expect(profile).toMatchObject({ id: "legacy-user-one", username: "legacy_one", display_username: "Display legacy-user-one", bio: "Bio legacy-user-one", mbti: "INTJ", what_i_do: "Engineer", listening_to: "Music", profile_visibility: "private", email: "one@example.test", email_verified: true, tier: "pro", role: "member", banned: false, ban_reason: null, ban_expires: null });
    expect(profile.created_at).toBe("2025-01-02 03:04:05");
    expect(profile.updated_at).toBe("2025-02-03 04:05:06");
    const [account] = await admin`select id, account_id, provider_id, user_id, password, created_at, updated_at, access_token, refresh_token, id_token, access_token_expires_at, refresh_token_expires_at, scope from public.account where id = 'legacy-google-one'`;
    expect(account).toMatchObject({ id: "legacy-google-one", account_id: "google-subject-one", provider_id: "google", user_id: "legacy-user-one", password: null, access_token: null, refresh_token: null, id_token: null, access_token_expires_at: null, refresh_token_expires_at: null, scope: null });
    const [password] = await admin`select password from public.account where id = 'legacy-credential-one'`;
    expect(password.password).toBe(legacyPasswordHash);
    const [omitted] = await admin`select (select count(*)::text from public.session) as sessions, (select count(*)::text from public.verification) as verifications`;
    expect(omitted).toEqual({ sessions: "0", verifications: "0" });

    const app = createAppForEnv({ HYPERDRIVE: { connectionString: "postgresql://app:app@localhost:5433/dayli_test" }, BETTER_AUTH_SECRET: "test-only-better-auth-secret-that-is-at-least-32-characters", BETTER_AUTH_BASE_URL: origin, BETTER_AUTH_TRUSTED_ORIGINS: origin });
    const response = await app.fetch(new Request(`${origin}/api/auth/sign-in/email`, { method: "POST", headers: { origin, "content-type": "application/json" }, body: JSON.stringify({ email: "one@example.test", password: "legacy-fixture-password" }) }));
    expect(response.status).toBe(200);
    const [session] = await admin`select user_id from public.session`;
    expect(session.user_id).toBe("legacy-user-one");
  });

  it("omits legacy bans and never clears target bans on replay", async () => {
    await admin`update legacy_source."user" set banned = true, ban_reason = 'discarded legacy ban', ban_expires = '2030-01-01 00:00:00' where id = 'legacy-user-one'`;
    await importUsersAndAccounts(source, target, { apply: true, sourceSchema: "legacy_source" });
    const [fresh] = await admin`select banned, ban_reason, ban_expires from public."user" where id = 'legacy-user-one'`;
    expect(fresh).toEqual({ banned: false, ban_reason: null, ban_expires: null });

    await admin`update public."user" set banned = true, ban_reason = 'target policy' where id = 'legacy-user-one'`;
    const replay = await importUsersAndAccounts(source, target, { apply: true, sourceSchema: "legacy_source" });
    expect(replay).toMatchObject({ status: "applied", insertedUsers: "0", insertedAccounts: "0" });
    const [existing] = await admin`select banned, ban_reason from public."user" where id = 'legacy-user-one'`;
    expect(existing).toEqual({ banned: true, ban_reason: "target policy" });
  });

  it("is replay-safe without overwriting existing users or accounts", async () => {
    await importUsersAndAccounts(source, target, { apply: true, sourceSchema: "legacy_source" });
    const replay = await importUsersAndAccounts(source, target, { apply: true, sourceSchema: "legacy_source" });
    expect(replay).toMatchObject({ status: "applied", replayedUsers: "2", replayedAccounts: "3", insertedUsers: "0", insertedAccounts: "0", targetConflicts: "0" });
  });

  it("blocks user or provider-account collisions without merging unrelated Neon identities", async () => {
    await admin`insert into public."user" (${admin.unsafe(profileColumns)}) values ('unrelated-user', 'Unrelated', 'unrelated', null, null, null, null, null, 'public', 'unrelated@example.test', false, null, now(), now(), 'free', null, false, null, null)`;
    await admin`insert into public.account (id, account_id, provider_id, user_id, created_at, updated_at) values ('unrelated-google', 'google-subject-one', 'google', 'unrelated-user', now(), now())`;
    const result = await importUsersAndAccounts(source, target, { apply: true, sourceSchema: "legacy_source" });
    expect(result).toMatchObject({ status: "blocked", targetConflicts: "1", insertedUsers: "0", insertedAccounts: "0" });
    const rows = await admin`select id from public."user" order by id`;
    expect(rows).toEqual([{ id: "unrelated-user" }]);
  });

  it("rolls back users and accounts together when an account insert fails", async () => {
    await admin.unsafe(`create function public.users_accounts_import_rollback_probe() returns trigger language plpgsql as $$ begin if new.id = 'legacy-google-one' then raise exception 'test rollback'; end if; return new; end; $$; create trigger users_accounts_import_rollback_probe before insert on public.account for each row execute function public.users_accounts_import_rollback_probe()`);
    await expect(importUsersAndAccounts(source, target, { apply: true, sourceSchema: "legacy_source" })).rejects.toThrow("test rollback");
    const [counts] = await admin`select (select count(*)::text from public."user") as users, (select count(*)::text from public.account) as accounts`;
    expect(counts).toEqual({ users: "0", accounts: "0" });
  });
});
