import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { describe, expect, it } from "vitest";
import { migrationsFolder } from "./migrations/state";

const migratorUrl = process.env.TEST_MESSAGING_PARTICIPANT_RACE_DATABASE_URL;
const appUrl = process.env.TEST_MESSAGING_PARTICIPANT_RACE_APP_DATABASE_URL;
const testPostgresPort = process.env.VERIFY_POSTGRES_PORT ?? "5433";
const enabled = Boolean(migratorUrl && appUrl);

if (process.env.REQUIRE_DB_TEST === "1" && !enabled) {
  throw new Error("TEST_MESSAGING_PARTICIPANT_RACE_DATABASE_URL and TEST_MESSAGING_PARTICIPANT_RACE_APP_DATABASE_URL are required for messaging participant migration race tests.");
}

function requireLocalUrl(value: string | undefined, name: string, user: string): string {
  if (!value) throw new Error(`${name} is required for messaging participant migration race tests.`);
  const url = new URL(value);
  if (url.hostname !== "localhost" || url.port !== testPostgresPort || url.pathname !== "/dayli_messaging_participant_race_test" || url.username !== user) {
    throw new Error(`${name} must target ${user}@localhost:${testPostgresPort}/dayli_messaging_participant_race_test.`);
  }
  return value;
}

async function waitFor(condition: () => Promise<boolean>, message: string): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (await condition()) return;
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
  throw new Error(message);
}

(enabled ? describe : describe.skip)("messaging participant migration race", () => {
  it("takes the final trigger lock before backfill without a holder upgrade cycle", async () => {
    const migrationUrl = requireLocalUrl(migratorUrl, "TEST_MESSAGING_PARTICIPANT_RACE_DATABASE_URL", "migrator");
    const applicationUrl = requireLocalUrl(appUrl, "TEST_MESSAGING_PARTICIPANT_RACE_APP_DATABASE_URL", "app");
    const migration = postgres(migrationUrl, { max: 1, prepare: false, onnotice: () => undefined });
    const inspector = postgres(migrationUrl, { max: 1, prepare: false, onnotice: () => undefined });
    const holder = postgres(migrationUrl, { max: 1, prepare: false, onnotice: () => undefined });
    const app = postgres(applicationUrl, { max: 1, prepare: false, onnotice: () => undefined });
    let baselineMigrations: string | undefined;
    let failingMigrations: string | undefined;
    let releaseHolder: (() => void) | undefined;
    let releaseWindow: (() => void) | undefined;

    try {
      baselineMigrations = await mkdtemp(path.join(os.tmpdir(), "dayli-messaging-race-baseline-"));
      await cp(migrationsFolder, baselineMigrations, { recursive: true });
      const baselineJournalPath = path.join(baselineMigrations, "meta", "_journal.json");
      const journal = JSON.parse(await readFile(baselineJournalPath, "utf8")) as { entries: Array<{ idx: number }> };
      journal.entries = journal.entries.filter((entry) => entry.idx <= 19);
      await writeFile(baselineJournalPath, `${JSON.stringify(journal, null, 2)}\n`);
      await migrate(drizzle(migration), {
        migrationsFolder: baselineMigrations,
        migrationsSchema: "drizzle",
        migrationsTable: "__drizzle_migrations",
      });

      const existingUserId = `messaging-race-existing-${crypto.randomUUID()}`;
      const holderUserId = `messaging-race-holder-${crypto.randomUUID()}`;
      const signupUserId = `messaging-race-signup-${crypto.randomUUID()}`;
      await app`
        insert into public."user" (id, name, email)
        values (${existingUserId}, 'Existing', ${`${existingUserId}@example.test`}),
               (${holderUserId}, 'Lock holder', ${`${holderUserId}@example.test`})
      `;

      const productionSql = await readFile(path.join(migrationsFolder, "0020_messaging_participant_identity_foundation.sql"), "utf8");
      const triggerStart = productionSql.indexOf("CREATE FUNCTION public.dayli_detach_messaging_participant()");
      if (triggerStart < 0) throw new Error("Could not find the messaging participant trigger boundary.");
      const beforeTriggers = productionSql.slice(0, triggerStart);
      const triggersAndGrants = productionSql.slice(triggerStart);

      // Drizzle must execute the whole migration in one transaction. Appending a
      // failure after the real migration proves that its table, backfill, and
      // trigger changes all roll back together.
      failingMigrations = await mkdtemp(path.join(os.tmpdir(), "dayli-messaging-race-failure-"));
      await cp(migrationsFolder, failingMigrations, { recursive: true });
      const failingMigrationPath = path.join(failingMigrations, "0020_messaging_participant_identity_foundation.sql");
      await writeFile(failingMigrationPath, `${productionSql}\n--> statement-breakpoint\nSELECT 1 / 0;\n`);
      await expect(migrate(drizzle(migration), {
        migrationsFolder: failingMigrations,
        migrationsSchema: "drizzle",
        migrationsTable: "__drizzle_migrations",
      })).rejects.toThrow();
      await expect(migration`select to_regclass('public.messaging_participants') as relation`).resolves.toEqual([{ relation: null }]);
      await expect(migration`
        select count(*)::int as count
        from pg_trigger
        where tgrelid = 'public."user"'::regclass
          and tgname in ('dayli_user_messaging_participant_create', 'dayli_user_messaging_participant_detach')
      `).resolves.toEqual([{ count: 0 }]);

      await holder`set lock_timeout = '5s'`;
      const migrationPid = Number((await migration`select pg_backend_pid() as pid`)[0]?.pid);
      const holderPid = Number((await holder`select pg_backend_pid() as pid`)[0]?.pid);
      const appPid = Number((await app`select pg_backend_pid() as pid`)[0]?.pid);
      let holderLocked: (() => void) | undefined;
      const holderHasRowLock = new Promise<void>((resolve) => { holderLocked = resolve; });
      const holderReleased = new Promise<void>((resolve) => { releaseHolder = resolve; });
      const holderOutcome = holder.begin(async (tx) => {
        await tx`select id from public."user" where id = ${holderUserId} for update`;
        holderLocked?.();
        await holderReleased;
        await tx`delete from public."user" where id = ${holderUserId}`;
      }).then(
        () => ({ status: "fulfilled" as const }),
        (error) => ({ status: "rejected" as const, error }),
      );
      await holderHasRowLock;

      let enterWindow: (() => void) | undefined;
      const windowEntered = new Promise<void>((resolve) => { enterWindow = resolve; });
      const windowReleased = new Promise<void>((resolve) => { releaseWindow = resolve; });
      const migrationOutcome = migration.begin(async (tx) => {
        await tx.unsafe(beforeTriggers);
        enterWindow?.();
        await windowReleased;
        await tx.unsafe(triggersAndGrants);
      }).then(
        () => ({ status: "fulfilled" as const }),
        (error) => ({ status: "rejected" as const, error }),
      );

      await windowEntered;
      await expect(inspector`
        select ${holderPid} = any(pg_blocking_pids(${migrationPid})) as blocked
      `).resolves.toEqual([{ blocked: false }]);
      const signupOutcome = app`
        insert into public."user" (id, name, email)
        values (${signupUserId}, 'Concurrent signup', ${`${signupUserId}@example.test`})
      `.then(
        () => ({ status: "fulfilled" as const }),
        (error) => ({ status: "rejected" as const, error }),
      );
      releaseHolder?.();

      for (const blockedPid of [appPid, holderPid]) {
        await waitFor(async () => {
          const [row] = await inspector`
            select ${migrationPid} = any(pg_blocking_pids(${blockedPid})) as blocked
          `;
          return row?.blocked === true;
        }, `Expected migration backend ${migrationPid} to block backend ${blockedPid}.`);
      }

      releaseWindow?.();
      await expect(migrationOutcome).resolves.toEqual({ status: "fulfilled" });
      await expect(signupOutcome).resolves.toEqual({ status: "fulfilled" });
      await expect(holderOutcome).resolves.toEqual({ status: "fulfilled" });
      await expect(inspector`
        select id, user_id, state
        from public.messaging_participants
        where id in (${existingUserId}, ${holderUserId}, ${signupUserId})
        order by id
      `).resolves.toEqual([
        { id: existingUserId, user_id: existingUserId, state: "active" },
        { id: holderUserId, user_id: null, state: "deleted" },
        { id: signupUserId, user_id: signupUserId, state: "active" },
      ]);
    } finally {
      releaseHolder?.();
      releaseWindow?.();
      await migration.end({ timeout: 5 });
      await inspector.end({ timeout: 5 });
      await holder.end({ timeout: 5 });
      await app.end({ timeout: 5 });
      if (baselineMigrations) await rm(baselineMigrations, { recursive: true, force: true });
      if (failingMigrations) await rm(failingMigrations, { recursive: true, force: true });
    }
  });
});
