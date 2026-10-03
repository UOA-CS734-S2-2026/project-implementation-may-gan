import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const port = process.env.VERIFY_POSTGRES_PORT ?? "5433";
const migratorUrl = process.env.TEST_LIFECYCLE_DATABASE_URL;
const appUrl = process.env.TEST_LIFECYCLE_APP_DATABASE_URL;
function localUrl(value: string, role: string): string {
  const url = new URL(value);
  if (url.hostname !== "localhost" || url.port !== port || url.pathname !== "/dayli_lifecycle_test" || url.username !== role) {
    throw new Error("Export owner tests require an isolated lifecycle database.");
  }
  return value;
}

(migratorUrl && appUrl ? describe : describe.skip)("session-bound export owner commands", () => {
  const migrator = postgres(localUrl(migratorUrl ?? `postgresql://migrator:migrator@localhost:${port}/dayli_lifecycle_test`, "migrator"), { max: 1 });
  const app = postgres(localUrl(appUrl ?? `postgresql://app:app@localhost:${port}/dayli_lifecycle_test`, "app"), { max: 1 });
  const suffix = crypto.randomUUID();
  const owner = `export-owner-${suffix}`;
  const outsider = `export-outsider-${suffix}`;
  const session = `export-session-${suffix}`;
  const outsiderSession = `export-other-session-${suffix}`;

  async function seed() {
    await migrator`insert into public."user" (id, name, email) values
      (${owner}, 'Export owner', ${`${owner}@example.test`}),
      (${outsider}, 'Export outsider', ${`${outsider}@example.test`})`;
    await migrator`insert into public.session (id, token, user_id, expires_at) values
      (${session}, ${`token-${suffix}`}, ${owner}, '2090-01-01T00:00:00Z'),
      (${outsiderSession}, ${`other-token-${suffix}`}, ${outsider}, '2090-01-01T00:00:00Z')`;
  }

  beforeAll(seed);

  afterAll(async () => {
    try { await migrator`delete from public."user" where id in (${owner}, ${outsider})`; }
    finally { await Promise.all([migrator.end(), app.end()]); }
  });

  it("denies direct request-table reads and cross-session calls", async () => {
    const [permissions] = await migrator<{ direct_read: boolean; can_request: boolean; can_read: boolean }[]>`
      select has_table_privilege('app', 'public.data_export_requests', 'SELECT') as direct_read,
        has_function_privilege('app', 'public.request_account_export(text,text,text)', 'EXECUTE') as can_request,
        has_function_privilege('app', 'public.read_account_export_status(text,text)', 'EXECUTE') as can_read`;
    expect(permissions).toMatchObject({ direct_read: false, can_request: true, can_read: true });
    await expect(app`select * from public.data_export_requests limit 1`).rejects.toThrow();
    expect(await app`select * from public.request_account_export(${owner}, ${outsiderSession}, ${`export-${suffix}`})`).toEqual([]);
    expect(await app`select * from public.read_account_export_status(${owner}, ${outsiderSession})`).toEqual([]);
  });

  it("creates one owner request, omits private keys, and fences irreversible deletion", async () => {
    const firstId = `export-${suffix}`;
    const [first] = await app<{ request_id: string; request_status: string; requested_at: Date }[]>`
      select * from public.request_account_export(${owner}, ${session}, ${firstId})`;
    expect(first).toMatchObject({ request_id: firstId, request_status: "requested" });
    const [duplicate] = await app`select * from public.request_account_export(${owner}, ${session}, ${`different-${suffix}`})`;
    expect(duplicate).toMatchObject({ request_id: firstId, request_status: "requested" });
    const [status] = await app`select * from public.read_account_export_status(${owner}, ${session})`;
    expect(status).toMatchObject({ request_id: firstId, request_status: "requested", ready_at: null, expires_at: null });
    expect(Object.keys(status ?? {}).sort()).toEqual(["expires_at", "ready_at", "request_id", "request_status", "requested_at"]);
    const digest = "e".repeat(64);
    await migrator`insert into public.account_lifecycles
      (user_id, state, request_id, idempotency_key_digest, generation, requested_at, cancel_until, purge_due_at)
      values (${owner}, 'pending_deletion', ${`deletion-${suffix}`}, ${digest}, 1,
        now(), now() + interval '168 hours', now() + interval '336 hours')`;
    // A pending account retains management access until its original purge deadline.
    expect((await app`select * from public.read_account_export_status(${owner}, ${session})`)[0]?.request_id).toBe(firstId);
    await migrator`update public.account_lifecycles
      set state = 'purging', purge_started_at = now(), generation = 2 where user_id = ${owner}`;
    expect(await app`select * from public.read_account_export_status(${owner}, ${session})`).toEqual([]);
    expect(await app`select * from public.request_account_export(${owner}, ${session}, ${`late-${suffix}`})`).toEqual([]);
  });
});
