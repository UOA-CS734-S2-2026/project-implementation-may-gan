import { readFile } from "node:fs/promises";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { repoPath } from "./migrations/paths";

const migratorUrl = process.env.TEST_DATABASE_URL;
const appUrl = process.env.TEST_APP_DATABASE_URL;
const hasTestDatabaseConfig = Boolean(migratorUrl && appUrl);

if (process.env.REQUIRE_DB_TEST === "1" && !hasTestDatabaseConfig) {
  throw new Error("TEST_DATABASE_URL and TEST_APP_DATABASE_URL are required for pnpm db:test.");
}

function requireLocalTestUrl(value: string | undefined, name: string): string {
  if (!value) {
    throw new Error(`${name} is required for database integration tests.`);
  }

  const url = new URL(value);
  if (url.hostname !== "localhost" || url.port !== "5433" || url.pathname !== "/dayli_test") {
    throw new Error(`${name} must target localhost:5433/dayli_test.`);
  }

  return value;
}

(hasTestDatabaseConfig ? describe : describe.skip)("local migration integration", () => {
  const migratorConnection = requireLocalTestUrl(migratorUrl ?? "postgresql://migrator:migrator@localhost:5433/dayli_test", "TEST_DATABASE_URL");
  const appConnection = requireLocalTestUrl(appUrl ?? "postgresql://app:app@localhost:5433/dayli_test", "TEST_APP_DATABASE_URL");
  const migrator = postgres(migratorConnection, { max: 1, prepare: false, onnotice: () => undefined });
  const app = postgres(appConnection, { max: 1, prepare: false, onnotice: () => undefined });

  beforeAll(async () => {
    await migrator`drop table if exists public.dayli_migration_fixture cascade`;
    await migrator`drop table if exists public.dayli_migration_rollback_probe cascade`;
    await migrator`drop table if exists public.dayli_app_denied cascade`;
  });

  afterAll(async () => {
    await migrator.end({ timeout: 5 });
    await app.end({ timeout: 5 });
  });

  it("applies the test-only fixture table and grants app DML", async () => {
    const fixtureSql = await readFile(repoPath("packages/db/test/fixtures/migrations/0001_create_fixture_table.sql"), "utf8");
    await migrator.unsafe(fixtureSql);

    await app`insert into public.dayli_migration_fixture (label) values ('ok')`;
    const rows = await app`select label from public.dayli_migration_fixture`;

    expect(rows).toEqual([{ label: "ok" }]);
  });

  it("rolls back a deliberately failing fixture batch", async () => {
    const fixtureSql = await readFile(repoPath("packages/db/test/fixtures/migrations/0002_failing_fixture.sql"), "utf8");

    await expect(migrator.begin((tx) => tx.unsafe(fixtureSql))).rejects.toThrow();

    const rows = await migrator`
      select 1
      from information_schema.tables
      where table_schema = 'public'
        and table_name = 'dayli_migration_rollback_probe'
    `;
    expect(rows).toHaveLength(0);
  });

  it("allows migrator DDL and denies app DDL", async () => {
    await migrator`create table public.dayli_app_denied (id integer primary key)`;
    await expect(app`alter table public.dayli_app_denied add column denied text`).rejects.toThrow();
  });

  it("uses an advisory lock to serialize migration sessions", async () => {
    const lockId = 7_340_008;
    const first = postgres(migratorConnection, { max: 1, prepare: false, onnotice: () => undefined });
    const second = postgres(migratorConnection, { max: 1, prepare: false, onnotice: () => undefined });

    try {
      await first`select pg_advisory_lock(${lockId})`;
      const rows = await second`select pg_try_advisory_lock(${lockId}) as acquired`;
      expect(rows[0]?.acquired).toBe(false);
    } finally {
      await first`select pg_advisory_unlock(${lockId})`;
      await first.end({ timeout: 5 });
      await second.end({ timeout: 5 });
    }
  });

  it("seeds all prompts and enforces immutable scheduled versions", async () => {
    const count = await migrator`select count(*)::int as count from public.daily_prompts`;
    expect(count[0]?.count).toBe(366);

    await expect(migrator`
      insert into public.daily_prompts
        (id, month_day, text, version, effective_date, source, source_commit)
      values
        ('prompt-04-31-v2', '04-31', 'Impossible date', 2, '2099-04-01', 'dayli-test', 'test')
    `).rejects.toMatchObject({ code: "23514" });
    await expect(migrator`
      insert into public.daily_prompts
        (id, month_day, text, version, effective_date, source, source_commit)
      values
        ('prompt-02-30-v2', '02-30', 'Impossible February date', 2, '2099-02-01', 'dayli-test', 'test')
    `).rejects.toMatchObject({ code: "23514" });
    await expect(migrator`
      insert into public.daily_prompts
        (id, month_day, text, version, effective_date, source, source_commit)
      values
        ('prompt-02-31-v2', '02-31', 'Impossible February date', 2, '2099-02-01', 'dayli-test', 'test')
    `).rejects.toMatchObject({ code: "23514" });

    const leapDay = await migrator`
      select id from public.daily_prompts where month_day = '02-29'
    `;
    expect(leapDay).toEqual([{ id: "prompt-02-29" }]);

    await expect(migrator`
      update public.daily_prompts
      set text = 'mutated'
      where id = 'prompt-01-01'
    `).rejects.toMatchObject({ code: "55000" });
    await expect(migrator`
      delete from public.daily_prompts
      where id = 'prompt-01-01'
    `).rejects.toMatchObject({ code: "55000" });

    const futurePrompt = {
      id: "prompt-01-01-v2",
      monthDay: "01-01",
      text: "A scheduled future prompt",
      version: 2,
      effectiveDate: "2099-01-01",
      source: "dayli-test",
      sourceCommit: "test",
    };

    const rollbackSentinel = new Error("rollback prompt fixture");
    let observedBeforeEffectiveDate: string | undefined;
    let observedAtEffectiveDate: string | undefined;
    let transactionError: unknown;
    try {
      await migrator.begin(async (tx) => {
        await tx`
        insert into public.daily_prompts
          (id, month_day, text, version, effective_date, source, source_commit)
        values
          (${futurePrompt.id}, ${futurePrompt.monthDay}, ${futurePrompt.text}, ${futurePrompt.version}, ${futurePrompt.effectiveDate}, ${futurePrompt.source}, ${futurePrompt.sourceCommit})
      `;
        const beforeEffectiveDate = await tx`
        select id
        from public.daily_prompts
        where month_day = ${futurePrompt.monthDay} and effective_date <= '2098-12-31'
        order by effective_date desc, version desc
        limit 1
      `;
        const atEffectiveDate = await tx`
        select id
        from public.daily_prompts
        where month_day = ${futurePrompt.monthDay} and effective_date <= '2099-01-01'
        order by effective_date desc, version desc
        limit 1
      `;
        observedBeforeEffectiveDate = beforeEffectiveDate[0]?.id as string | undefined;
        observedAtEffectiveDate = atEffectiveDate[0]?.id as string | undefined;
        throw rollbackSentinel;
      });
    } catch (error) {
      transactionError = error;
    }
    expect(transactionError).toBe(rollbackSentinel);
    expect(observedBeforeEffectiveDate).toBe("prompt-01-01");
    expect(observedAtEffectiveDate).toBe(futurePrompt.id);

    await expect(migrator.begin((tx) => tx`
      insert into public.daily_prompts
        (id, month_day, text, version, effective_date, source, source_commit)
      values
        ('prompt-01-01-v3', '01-01', 'Earlier prompt', 3, '1969-12-31', 'dayli-test', 'test')
    `)).rejects.toMatchObject({ code: "23514" });

    const leftover = await migrator`
      select id from public.daily_prompts
      where id in (${futurePrompt.id}, ${"prompt-01-01-v3"})
    `;
    expect(leftover).toHaveLength(0);
  });

  it("serializes concurrent schedules for the same month-day", async () => {
    const first = postgres(migratorConnection, { max: 1, prepare: false, onnotice: () => undefined });
    const second = postgres(migratorConnection, { max: 1, prepare: false, onnotice: () => undefined });

    try {
      const existing = await migrator`
        select
          coalesce(max(version), 1)::int as version,
          greatest(
            coalesce(max(effective_date), date '1970-01-01') + interval '1 year',
            current_date + interval '1 year'
          )::date::text as effective_date
        from public.daily_prompts
        where month_day = '12-31'
      `;
      const nextVersion = Number(existing[0]?.version ?? 1) + 1;
      const nextVersionAfterRace = nextVersion + 1;
      const effectiveDate = String(existing[0]?.effective_date ?? "2099-12-31");

      const firstInsert = first.begin(async (tx) => {
        await tx`
          insert into public.daily_prompts
            (id, month_day, text, version, effective_date, source, source_commit)
          values
            (${`prompt-12-31-v${nextVersion}`}, '12-31', 'Concurrent first prompt', ${nextVersion}, ${effectiveDate}, 'dayli-test', 'test')
        `;
      });

      const secondInsert = second.begin((tx) => tx`
          insert into public.daily_prompts
            (id, month_day, text, version, effective_date, source, source_commit)
          values
          (${`prompt-12-31-v${nextVersionAfterRace}`}, '12-31', 'Concurrent second prompt', ${nextVersionAfterRace}, ${effectiveDate}, 'dayli-test', 'test')
      `);

      const results = await Promise.allSettled([firstInsert, secondInsert]);
      expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
      expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
      const rejected = results.find((result) => result.status === "rejected");
      expect(rejected?.status === "rejected" ? rejected.reason : undefined).toMatchObject({ code: "23514" });

      const rows = await migrator`
        select id, version, effective_date
        from public.daily_prompts
        where month_day = '12-31' and version > 1
      `;
      expect(rows).toHaveLength(1);
    } finally {
      await first.end({ timeout: 5 });
      await second.end({ timeout: 5 });
    }
  });
});
