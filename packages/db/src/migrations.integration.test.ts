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

  async function cleanupPromptFixtures(): Promise<void> {
    await migrator`alter table public.daily_prompts disable trigger user`;
    try {
      await migrator`delete from public.daily_prompts where source = 'dayli-test'`;
    } finally {
      await migrator`alter table public.daily_prompts enable trigger user`;
    }
  }

  beforeAll(async () => {
    await migrator`drop table if exists public.dayli_migration_fixture cascade`;
    await migrator`drop table if exists public.dayli_migration_rollback_probe cascade`;
    await migrator`drop table if exists public.dayli_app_denied cascade`;
    await cleanupPromptFixtures();
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
    const count = await migrator`select count(*)::int as count from public.daily_prompts where version = 1`;
    expect(count[0]?.count).toBe(366);

    await migrator`
      insert into public.daily_prompts
      select * from public.daily_prompts where id = 'prompt-01-01'
      on conflict do nothing
    `;

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
    await expect(migrator`
      insert into public.daily_prompts
        (id, month_day, text, version, effective_date, source, source_commit)
      values
        ('prompt-04-30-v2', '04-29', 'Mismatched prompt day', 2, '2099-04-01', 'dayli-test', 'test')
    `).rejects.toMatchObject({ code: "23514" });
    // The v1 row already owns this ID, so the immutability guard rejects the
    // changed replay before the canonical-ID check can run.
    await expect(migrator`
      insert into public.daily_prompts
        (id, month_day, text, version, effective_date, source, source_commit)
      values
        ('prompt-04-30', '04-30', 'Missing version suffix', 2, '2099-04-01', 'dayli-test', 'test')
    `).rejects.toMatchObject({ code: "55000" });
    await expect(migrator`
      insert into public.daily_prompts
        (id, month_day, text, version, effective_date, source, source_commit)
      values
        ('prompt-04-30-v3', '04-30', 'Mismatched prompt version', 2, '2099-04-01', 'dayli-test', 'test')
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
        where month_day = '12-31' and version in (${nextVersion}, ${nextVersionAfterRace})
      `;
      expect(rows).toHaveLength(1);
    } finally {
      await cleanupPromptFixtures();
      await first.end({ timeout: 5 });
      await second.end({ timeout: 5 });
    }
  });

  it("enforces the post foundation, active media replacement, and historical metadata rules", async () => {
    const columns = await migrator`
      select table_name, column_name, data_type, udt_name, is_nullable, column_default
      from information_schema.columns
      where table_schema = 'public'
        and table_name in ('posts', 'post_media', 'post_revisions', 'legacy_cloudinary_media', 'tomorrow_notes')
        and column_name in ('local_date', 'accepted_at', 'released_at', 'detached_at', 'previous_attachment_refs', 'audience', 'legacy_type')
      order by table_name, column_name
    `;
    const column = (tableName: string, columnName: string) => columns.find(
      (row) => row.table_name === tableName && row.column_name === columnName,
    );

    expect(column("posts", "local_date")).toMatchObject({ data_type: "date", is_nullable: "NO" });
    expect(column("posts", "accepted_at")).toMatchObject({ data_type: "timestamp with time zone" });
    expect(column("posts", "released_at")).toMatchObject({ data_type: "timestamp with time zone", is_nullable: "NO" });
    expect(column("post_media", "detached_at")).toMatchObject({ data_type: "timestamp with time zone", is_nullable: "YES" });
    expect(column("post_revisions", "previous_attachment_refs")).toMatchObject({ data_type: "jsonb", is_nullable: "NO" });
    expect(column("legacy_cloudinary_media", "legacy_type")).toMatchObject({ data_type: "text", is_nullable: "YES" });
    expect(column("posts", "audience")).toMatchObject({ is_nullable: "NO", column_default: null });

    const authorId = `post-foundation-author-${crypto.randomUUID()}`;
    const otherAuthorId = `post-foundation-other-author-${crypto.randomUUID()}`;
    const postId = `post-foundation-${crypto.randomUUID()}`;
    const otherPostId = `post-foundation-other-${crypto.randomUUID()}`;
    const promptId = "prompt-01-01";
    const rollbackSentinel = new Error("rollback post foundation fixtures");
    let transactionError: unknown;

    try {
      await migrator.begin(async (tx) => {
        await tx`
          insert into public."user" (id, name, email)
          values
            (${authorId}, 'Post Foundation Fixture', ${`${authorId}@example.test`}),
            (${otherAuthorId}, 'Other Post Foundation Fixture', ${`${otherAuthorId}@example.test`})
        `;
        await tx`
          insert into public.posts
            (id, author_id, local_date, prompt_id, reflective_answer, caption, rating, audience, accepted_at, released_at)
          values
            (${postId}, ${authorId}, '2026-09-22', ${promptId}, 'A valid reflection', 'A valid caption', 8, 'friends', '2026-09-22T10:00:00+12:00', '2026-09-22T10:00:01+12:00')
        `;
        await tx`
          insert into public.posts
            (id, author_id, local_date, prompt_id, reflective_answer, rating, audience, accepted_at, released_at)
          values
            (${otherPostId}, ${authorId}, '2026-10-01', ${promptId}, 'Another valid reflection', 8, 'friends', '2026-10-01T10:00:00+12:00', '2026-10-01T10:00:01+12:00')
        `;

        await expect(tx.savepoint((savepoint) => savepoint`
          insert into public.posts
            (id, author_id, local_date, prompt_id, reflective_answer, rating, audience, accepted_at, released_at)
          values
            (${`duplicate-${postId}`}, ${authorId}, '2026-09-22', ${promptId}, 'Another reflection', 7, 'solo', '2026-09-22T10:00:00+12:00', '2026-09-22T10:00:01+12:00')
        `)).rejects.toMatchObject({ code: "23505" });

        await expect(tx.savepoint((savepoint) => savepoint`
          insert into public.posts
            (id, author_id, local_date, prompt_id, reflective_answer, rating, audience, accepted_at, released_at)
          values
            (${`same-time-release-${postId}`}, ${authorId}, '2026-09-23', ${promptId}, 'Same instant is invalid', 7, 'solo', '2026-09-23T10:00:00+12:00', '2026-09-23T10:00:00+12:00')
        `)).rejects.toMatchObject({ code: "23514" });

        await expect(tx.savepoint((savepoint) => savepoint`
          insert into public.posts
            (id, author_id, local_date, prompt_id, reflective_answer, rating, audience, accepted_at, released_at)
          values
            (${`bad-rating-${postId}`}, ${authorId}, '2026-09-24', ${promptId}, 'Bad rating', 11, 'solo', '2026-09-24T10:00:00+12:00', '2026-09-24T10:00:01+12:00')
        `)).rejects.toMatchObject({ code: "23514" });

        await expect(tx.savepoint((savepoint) => savepoint`
          insert into public.posts
            (id, author_id, local_date, prompt_id, reflective_answer, rating, audience, accepted_at, released_at)
          values
            (${`bad-answer-${postId}`}, ${authorId}, '2026-09-25', ${promptId}, ${"🙂".repeat(4_001)}, 7, 'solo', '2026-09-25T10:00:00+12:00', '2026-09-25T10:00:01+12:00')
        `)).rejects.toMatchObject({ code: "23514" });

        await expect(tx.savepoint((savepoint) => savepoint`
          insert into public.posts
            (id, author_id, local_date, prompt_id, reflective_answer, caption, rating, audience, accepted_at, released_at)
          values
            (${`bad-caption-${postId}`}, ${authorId}, '2026-09-26', ${promptId}, 'Bad caption', ${"🙂".repeat(1_001)}, 7, 'solo', '2026-09-26T10:00:00+12:00', '2026-09-26T10:00:01+12:00')
        `)).rejects.toMatchObject({ code: "23514" });

        await expect(tx.savepoint((savepoint) => savepoint`
          insert into public.posts
            (id, author_id, local_date, prompt_id, reflective_answer, rating, accepted_at, released_at)
          values
            (${`missing-audience-${postId}`}, ${authorId}, '2026-09-28', ${promptId}, 'Missing audience', 7, '2026-09-28T10:00:00+12:00', '2026-09-28T10:00:01+12:00')
        `)).rejects.toMatchObject({ code: "23502" });

        await expect(tx.savepoint((savepoint) => savepoint`
          insert into public.posts
            (id, author_id, local_date, prompt_id, reflective_answer, rating, audience, accepted_at, released_at)
          values
            (${`bad-author-${postId}`}, 'missing-author', '2026-09-29', ${promptId}, 'Missing author', 7, 'solo', '2026-09-29T10:00:00+12:00', '2026-09-29T10:00:01+12:00')
        `)).rejects.toMatchObject({ code: "23503" });

        await expect(tx.savepoint((savepoint) => savepoint`
          insert into public.posts
            (id, author_id, local_date, prompt_id, reflective_answer, rating, audience, accepted_at, released_at)
          values
            (${`bad-prompt-${postId}`}, ${authorId}, '2026-09-30', 'missing-prompt', 'Missing prompt', 7, 'solo', '2026-09-30T10:00:00+12:00', '2026-09-30T10:00:01+12:00')
        `)).rejects.toMatchObject({ code: "23503" });

        for (let order = 0; order < 4; order += 1) {
          await tx`
            insert into public.post_media (id, post_id, attachment_order)
            values (${`media-${postId}-${order}`}, ${postId}, ${order})
          `;
        }

        await expect(tx.savepoint((savepoint) => savepoint`
          insert into public.post_media (id, post_id, attachment_order)
          values (${`duplicate-media-${postId}`}, ${postId}, 2)
        `)).rejects.toMatchObject({ code: "23505" });

        await tx`
          update public.post_media
          set detached_at = '2026-09-22T12:00:00+12:00'
          where id = ${`media-${postId}-0`}
        `;
        await tx`
          insert into public.post_media (id, post_id, attachment_order)
          values (${`replacement-media-${postId}`}, ${postId}, 0)
        `;
        const mediaCounts = await tx`
          select count(*)::int as total,
                 count(*) filter (where detached_at is null)::int as active
          from public.post_media
          where post_id = ${postId}
        `;
        expect(mediaCounts[0]).toEqual({ total: 5, active: 4 });

        await tx`
          insert into public.legacy_cloudinary_media (media_id, cloudinary_public_id, cloudinary_url, legacy_type)
          values (${`media-${postId}-1`}, 'legacy/public-id', 'https://res.cloudinary.com/example/image/upload/legacy', 'IMAGE')
        `;

        const validRevisionRefs = [
          { media_id: `media-${postId}-0`, attachment_order: 0, status: "detached" },
          { media_id: `media-${postId}-1`, attachment_order: 1, status: "attached" },
        ];
        await tx`
          insert into public.post_revisions
            (id, post_id, revision_number, previous_reflective_answer, previous_caption, previous_rating, previous_audience, previous_prompt_id, previous_attachment_refs)
          values
            (${`revision-${postId}-1`}, ${postId}, 1, 'Prior reflection', 'Prior caption', 8, 'friends', ${promptId}, ${tx.json(validRevisionRefs)})
        `;

        await expect(tx.savepoint((savepoint) => savepoint`
          insert into public.post_revisions
            (id, post_id, revision_number, previous_reflective_answer, previous_rating, previous_audience, previous_prompt_id, previous_attachment_refs)
          values
            (${`cross-post-revision-${otherPostId}`}, ${otherPostId}, 1, 'Prior reflection', 8, 'friends', ${promptId}, ${savepoint.json(validRevisionRefs)})
        `)).rejects.toMatchObject({ code: "23503" });

        await expect(tx.savepoint((savepoint) => savepoint`
          update public.post_media
          set post_id = ${otherPostId}
          where id = ${`media-${postId}-1`}
        `)).rejects.toMatchObject({ code: "55000" });

        await expect(tx.savepoint((savepoint) => savepoint`
          update public.posts
          set author_id = ${otherAuthorId}
          where id = ${postId}
        `)).rejects.toMatchObject({ code: "55000" });

        await expect(tx.savepoint((savepoint) => savepoint`
          update public.post_media
          set id = ${`reused-media-${postId}`}
          where id = ${`media-${postId}-1`}
        `)).rejects.toMatchObject({ code: "55000" });

        const invalidRevision = async (id: string, refs: Parameters<typeof tx.json>[0]) => {
          await expect(tx.savepoint((savepoint) => savepoint`
            insert into public.post_revisions
              (id, post_id, revision_number, previous_reflective_answer, previous_rating, previous_audience, previous_prompt_id, previous_attachment_refs)
            values
              (${id}, ${postId}, 2, 'Prior reflection', 8, 'friends', ${promptId}, ${savepoint.json(refs)})
          `)).rejects.toMatchObject({ code: "23514" });
        };
        await invalidRevision(`invalid-not-array-${postId}`, { media_id: "x" });
        await invalidRevision(`invalid-array-element-${postId}`, [null]);
        await invalidRevision(`invalid-extra-key-${postId}`, [{ media_id: "x", attachment_order: 0, status: "attached", url: "forbidden" }]);
        await invalidRevision(`invalid-duplicate-id-${postId}`, [
          { media_id: "x", attachment_order: 0, status: "attached" },
          { media_id: "x", attachment_order: 1, status: "detached" },
        ]);
        await invalidRevision(`invalid-order-${postId}`, [
          { media_id: "x", attachment_order: 1, status: "attached" },
          { media_id: "y", attachment_order: 1, status: "detached" },
        ]);
        await invalidRevision(`invalid-status-${postId}`, [{ media_id: "x", attachment_order: 0, status: "removed" }]);

        await expect(tx.savepoint((savepoint) => savepoint`
          update public.post_revisions
          set previous_rating = 9
          where id = ${`revision-${postId}-1`}
        `)).rejects.toMatchObject({ code: "55000" });

        await tx`
          insert into public.tomorrow_notes (id, post_id, author_id, note, available_on)
          values (${`note-${postId}`}, ${postId}, ${authorId}, 'Read this tomorrow', '2026-09-23')
        `;
        await expect(tx.savepoint((savepoint) => savepoint`
          update public.posts
          set local_date = '2026-09-23'
          where id = ${postId}
        `)).rejects.toMatchObject({ code: "55000" });
        await expect(tx.savepoint((savepoint) => savepoint`
          insert into public.tomorrow_notes (id, post_id, author_id, note, available_on)
          values (${`early-note-${postId}`}, ${postId}, ${authorId}, 'Too early', '2026-09-22')
        `)).rejects.toMatchObject({ code: "23514" });
        await expect(tx.savepoint((savepoint) => savepoint`
          update public.tomorrow_notes set note = 'changed' where id = ${`note-${postId}`}
        `)).rejects.toMatchObject({ code: "55000" });

        const noteRows = await tx`
          select note, available_on::text as available_on from public.tomorrow_notes where id = ${`note-${postId}`}
        `;
        expect(noteRows).toEqual([{ note: "Read this tomorrow", available_on: "2026-09-23" }]);

        // The tracked migrator cleanup is the only supported physical-delete
        // path for immutable post history. Keep this fixture transactional.
        await tx`delete from public.tomorrow_notes where post_id = ${postId}`;
        await tx`delete from public.post_revisions where post_id = ${postId}`;
        await tx`delete from public.legacy_cloudinary_media where media_id like ${`media-${postId}-%`}`;
        await tx`delete from public.post_media where post_id = ${postId}`;
        await tx`delete from public.posts where id = ${postId}`;
        const deletedRows = await tx`
          select
            (select count(*) from public.posts where id = ${postId})::int as posts,
            (select count(*) from public.post_media where post_id = ${postId})::int as media,
            (select count(*) from public.post_revisions where post_id = ${postId})::int as revisions,
            (select count(*) from public.tomorrow_notes where post_id = ${postId})::int as notes
        `;
        expect(deletedRows[0]).toEqual({ posts: 0, media: 0, revisions: 0, notes: 0 });

        throw rollbackSentinel;
      });
    } catch (error) {
      transactionError = error;
    }

    expect(transactionError).toBe(rollbackSentinel);
  });

  it("denies app deletes of immutable post history and allows migrator cleanup", async () => {
    // The app role runs on its own connection, so these fixtures must be
    // committed; the migrator cleanup path below removes them again.
    const authorId = `post-cleanup-author-${crypto.randomUUID()}`;
    const postId = `post-cleanup-${crypto.randomUUID()}`;
    const mediaId = `media-${postId}`;
    const revisionId = `revision-${postId}`;
    const noteId = `note-${postId}`;

    await migrator.begin(async (tx) => {
      await tx`
        insert into public."user" (id, name, email)
        values (${authorId}, 'Post Cleanup Fixture', ${`${authorId}@example.test`})
      `;
      await tx`
        insert into public.posts
          (id, author_id, local_date, prompt_id, reflective_answer, rating, audience, accepted_at, released_at)
        values
          (${postId}, ${authorId}, '2026-09-22', 'prompt-01-01', 'A valid reflection', 8, 'friends', '2026-09-22T10:00:00+12:00', '2026-09-22T10:00:01+12:00')
      `;
      await tx`
        insert into public.post_media (id, post_id, attachment_order)
        values (${mediaId}, ${postId}, 0)
      `;
      await tx`
        insert into public.post_revisions
          (id, post_id, revision_number, previous_reflective_answer, previous_rating, previous_audience, previous_prompt_id, previous_attachment_refs)
        values
          (${revisionId}, ${postId}, 1, 'Prior reflection', 8, 'friends', 'prompt-01-01', ${tx.json([{ media_id: mediaId, attachment_order: 0, status: "attached" }])})
      `;
      await tx`
        insert into public.tomorrow_notes (id, post_id, author_id, note, available_on)
        values (${noteId}, ${postId}, ${authorId}, 'Read this tomorrow', '2026-09-23')
      `;
    });

    try {
      await expect(app`delete from public.tomorrow_notes where id = ${noteId}`).rejects.toMatchObject({ code: "55000" });
      await expect(app`delete from public.post_revisions where id = ${revisionId}`).rejects.toMatchObject({ code: "55000" });
      await expect(app`delete from public.post_media where id = ${mediaId}`).rejects.toMatchObject({ code: "55000" });
      await expect(app`delete from public.daily_prompts where id = 'prompt-01-01'`).rejects.toMatchObject({ code: "55000" });
    } finally {
      await migrator.begin(async (tx) => {
        await tx`delete from public.tomorrow_notes where post_id = ${postId}`;
        await tx`delete from public.post_revisions where post_id = ${postId}`;
        await tx`delete from public.post_media where post_id = ${postId}`;
        await tx`delete from public.posts where id = ${postId}`;
        await tx`delete from public."user" where id = ${authorId}`;
      });
    }

    const remaining = await migrator`
      select
        (select count(*) from public.posts where id = ${postId})::int as posts,
        (select count(*) from public.post_media where post_id = ${postId})::int as media,
        (select count(*) from public.post_revisions where post_id = ${postId})::int as revisions,
        (select count(*) from public.tomorrow_notes where post_id = ${postId})::int as notes
    `;
    expect(remaining[0]).toEqual({ posts: 0, media: 0, revisions: 0, notes: 0 });
  });
});
