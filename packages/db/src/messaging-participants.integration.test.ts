import { readFile } from "node:fs/promises";
import postgres from "postgres";
import { afterAll, describe, expect, it } from "vitest";
import { repoPath } from "./migrations/paths";

const migratorUrl = process.env.TEST_DATABASE_URL;
const appUrl = process.env.TEST_APP_DATABASE_URL;
const testPostgresPort = process.env.VERIFY_POSTGRES_PORT ?? "5433";
const enabled = Boolean(migratorUrl && appUrl);

if (process.env.REQUIRE_DB_TEST === "1" && !enabled) {
  throw new Error("TEST_DATABASE_URL and TEST_APP_DATABASE_URL are required for messaging participant integration tests.");
}

function requireLocalUrl(value: string | undefined, name: string, user: string): string {
  if (!value) throw new Error(`${name} is required for messaging participant integration tests.`);
  const url = new URL(value);
  if (url.hostname !== "localhost" || url.port !== testPostgresPort || url.pathname !== "/dayli_test" || url.username !== user) {
    throw new Error(`${name} must target ${user}@localhost:${testPostgresPort}/dayli_test.`);
  }
  return value;
}

(enabled ? describe : describe.skip)("messaging participant identity foundation", () => {
  const migrator = postgres(requireLocalUrl(migratorUrl ?? `postgresql://migrator:migrator@localhost:${testPostgresPort}/dayli_test`, "TEST_DATABASE_URL", "migrator"), { max: 1, prepare: false, onnotice: () => undefined });
  const app = postgres(requireLocalUrl(appUrl ?? `postgresql://app:app@localhost:${testPostgresPort}/dayli_test`, "TEST_APP_DATABASE_URL", "app"), { max: 1, prepare: false, onnotice: () => undefined });
  const users: string[] = [];
  const participants: string[] = [];

  async function createUser(label: string): Promise<string> {
    const id = `messaging-participant-${label}-${crypto.randomUUID()}`;
    users.push(id);
    participants.push(id);
    await app`insert into public."user" (id, name, email) values (${id}, ${label}, ${`${id}@example.test`})`;
    return id;
  }

  afterAll(async () => {
    try {
      if (users.length > 0) await migrator`delete from public."user" where id = any(${users})`;
      if (participants.length > 0) await migrator`delete from public.messaging_participants where id = any(${participants})`;
    } finally {
      await migrator.end({ timeout: 5 });
      await app.end({ timeout: 5 });
    }
  });

  it("creates and detaches a profile-free participant without granting runtime access", async () => {
    const alice = await createUser("Alice");

    await expect(migrator`
      select id, user_id, state
      from public.messaging_participants
      where id = ${alice}
    `).resolves.toEqual([{ id: alice, user_id: alice, state: "active" }]);
    await expect(app`select id from public.messaging_participants`).rejects.toMatchObject({ code: "42501" });

    await migrator`delete from public."user" where id = ${alice}`;
    users.splice(users.indexOf(alice), 1);

    await expect(migrator`
      select id, user_id, state
      from public.messaging_participants
      where id = ${alice}
    `).resolves.toEqual([{ id: alice, user_id: null, state: "deleted" }]);

    const bootstrap = await readFile(repoPath("packages/db/admin/bootstrap-migrator.sql"), "utf8");
    await migrator.unsafe(bootstrap);
    await expect(app`select id from public.messaging_participants`).rejects.toMatchObject({ code: "42501" });
  });
});
