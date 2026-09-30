import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const migratorUrl = process.env.TEST_DATABASE_URL;
const appUrl = process.env.TEST_APP_DATABASE_URL;
const lifecycleWorkerUrl = process.env.TEST_LIFECYCLE_WORKER_DATABASE_URL;
const enabled = Boolean(migratorUrl && appUrl && lifecycleWorkerUrl);
const testPostgresPort = process.env.VERIFY_POSTGRES_PORT ?? "5433";

function requireLocalTestUrl(value: string | undefined, name: string, user: string): string {
  if (!value) throw new Error(`${name} is required for lifecycle database integration tests.`);
  const url = new URL(value);
  if (url.hostname !== "localhost" || url.port !== testPostgresPort || url.pathname !== "/dayli_test" || url.username !== user) {
    throw new Error(`${name} must target ${user}@localhost:${testPostgresPort}/dayli_test.`);
  }
  return value;
}

(enabled ? describe : describe.skip)("lifecycle schema and least-privilege integration", () => {
  const migratorConnection = requireLocalTestUrl(migratorUrl ?? `postgresql://migrator:migrator@localhost:${testPostgresPort}/dayli_test`, "TEST_DATABASE_URL", "migrator");
  const appConnection = requireLocalTestUrl(appUrl ?? `postgresql://app:app@localhost:${testPostgresPort}/dayli_test`, "TEST_APP_DATABASE_URL", "app");
  const lifecycleWorkerConnection = requireLocalTestUrl(lifecycleWorkerUrl ?? `postgresql://lifecycle_worker:lifecycle_worker@localhost:${testPostgresPort}/dayli_test`, "TEST_LIFECYCLE_WORKER_DATABASE_URL", "lifecycle_worker");
  const migrator = postgres(migratorConnection, { max: 1, prepare: false, onnotice: () => undefined });
  const app = postgres(appConnection, { max: 1, prepare: false, onnotice: () => undefined });
  const lifecycleWorker = postgres(lifecycleWorkerConnection, { max: 1, prepare: false, onnotice: () => undefined });
  const users: string[] = [];
  const legalVersions: string[] = [];
  const receipts: string[] = [];
  const exportCleanupTasks: string[] = [];

  async function createUser(label: string): Promise<string> {
    const id = `lifecycle-${label}-${crypto.randomUUID()}`;
    users.push(id);
    await migrator`
      insert into public."user" (id, name, email)
      values (${id}, 'Lifecycle Fixture', ${`${id}@example.test`})
    `;
    return id;
  }

  beforeAll(async () => {
    await migrator`set time zone 'UTC'`;
    await app`set time zone 'UTC'`;
    await lifecycleWorker`set time zone 'UTC'`;
  });

  afterAll(async () => {
    try {
      if (receipts.length > 0) await migrator`delete from public.account_purge_receipts where request_id = any(${receipts})`;
      if (legalVersions.length > 0) {
        await migrator`delete from public.terms_acceptances where terms_version_id = any(${legalVersions})`;
        await migrator`delete from public.registration_intents where terms_version_id = any(${legalVersions})`;
      }
      if (users.length > 0) await migrator`delete from public."user" where id = any(${users})`;
      if (exportCleanupTasks.length > 0) await migrator`delete from public.data_export_object_cleanup_tasks where id = any(${exportCleanupTasks})`;
      if (legalVersions.length > 0) await migrator`delete from public.legal_document_versions where id = any(${legalVersions})`;
    } finally {
      await migrator.end({ timeout: 5 });
      await app.end({ timeout: 5 });
      await lifecycleWorker.end({ timeout: 5 });
    }
  });

  it("enforces absolute 168-hour and 336-hour lifecycle boundaries across DST", async () => {
    const userId = await createUser("deadlines");
    const requestId = `request-${crypto.randomUUID()}`;
    const digest = "a".repeat(64);
    const requestedAt = "2026-03-04T22:00:00.000Z";

    await migrator`set time zone 'America/New_York'`;
    await app`set time zone 'America/New_York'`;
    try {
      await app`insert into public.account_lifecycles (user_id) values (${userId})`;
      await app`
        update public.account_lifecycles
        set state = 'pending_deletion', request_id = ${requestId}, idempotency_key_digest = ${digest},
            generation = 1, requested_at = ${requestedAt}, cancel_until = ${"2026-03-11T22:00:00.000Z"},
            purge_due_at = ${"2026-03-18T22:00:00.000Z"}
        where user_id = ${userId}
      `;

      const rows = await migrator`
        select
          cancel_until = requested_at + interval '168 hours' as cancellation_window,
          purge_due_at = requested_at + interval '336 hours' as purge_window
        from public.account_lifecycles where user_id = ${userId}
      `;
      expect(rows).toEqual([{ cancellation_window: true, purge_window: true }]);

      await expect(app.begin((tx) => tx`
        update public.account_lifecycles
        set cancel_until = requested_at + interval '7 days'
        where user_id = ${userId}
      `)).rejects.toMatchObject({ code: "23514" });
    } finally {
      await migrator`set time zone 'UTC'`;
      await app`set time zone 'UTC'`;
    }
  });

  it("fences export generations, uses 24 absolute hours, and retains cleanup retries separately", async () => {
    const userId = await createUser("export");
    const firstId = `export-${crypto.randomUUID()}`;
    const secondId = `export-${crypto.randomUUID()}`;
    const cleanupTaskId = `export-cleanup-${crypto.randomUUID()}`;
    const requestedAt = "2026-03-04T22:00:00.000Z";
    const readyAt = "2026-03-07T22:00:00.000Z";
    exportCleanupTasks.push(cleanupTaskId);

    await migrator`set time zone 'America/New_York'`;
    await app`set time zone 'America/New_York'`;
    try {
      await app`
        insert into public.data_export_requests (id, user_id, lifecycle_generation, requested_at)
        values (${firstId}, ${userId}, 3, ${requestedAt})
      `;
      await expect(app.begin((tx) => tx`
        insert into public.data_export_requests (id, user_id, lifecycle_generation, requested_at)
        values (${secondId}, ${userId}, 3, ${requestedAt})
      `)).rejects.toMatchObject({ code: "23505" });

      await app`
        update public.data_export_requests
        set status = 'ready', snapshot_cutoff_at = ${requestedAt}, archive_object_key = 'exports/opaque/archive',
            ready_at = ${readyAt}, expires_at = '2026-03-08T22:00:00.000Z'
        where id = ${firstId}
      `;
      await expect(app.begin((tx) => tx`
        update public.data_export_requests
        set expires_at = ready_at + interval '1 day'
        where id = ${firstId}
      `)).rejects.toMatchObject({ code: "23514" });

      await migrator`
        insert into public.data_export_object_cleanup_tasks (id, archive_object_key, next_attempt_at)
        values (${cleanupTaskId}, 'exports/opaque/archive', ${readyAt})
      `;
      await app`
        update public.data_export_requests
        set status = 'expired', snapshot_cutoff_at = null, archive_object_key = null,
            ready_at = null, expires_at = null, archive_cleanup_task_id = ${cleanupTaskId}
        where id = ${firstId}
      `;
      await expect(app.begin((tx) => tx`
        update public.data_export_requests
        set snapshot_cutoff_at = ${requestedAt}
        where id = ${firstId}
      `)).rejects.toMatchObject({ code: "23514" });
      const cleanupRows = await migrator`
        select archive_object_key, status, next_attempt_at = ${readyAt}::timestamptz as retained_retry
        from public.data_export_object_cleanup_tasks where id = ${cleanupTaskId}
      `;
      expect(cleanupRows).toEqual([{ archive_object_key: "exports/opaque/archive", status: "pending", retained_retry: true }]);
      await expect(app`select * from public.data_export_object_cleanup_tasks`).rejects.toMatchObject({ code: "42501" });
    } finally {
      await migrator`set time zone 'UTC'`;
      await app`set time zone 'UTC'`;
    }
  });

  it("keeps legal acceptance separate from policy display and protects completion receipts", async () => {
    const userId = await createUser("legal");
    const versionId = `terms-${crypto.randomUUID()}`;
    const receiptId = `receipt-${crypto.randomUUID()}`;
    legalVersions.push(versionId);
    receipts.push(receiptId);

    await migrator`
      insert into public.legal_document_versions (id, kind, version, content_digest, status, effective_at)
      values (${versionId}, 'terms', 1, ${"b".repeat(64)}, 'effective', '2026-09-30T00:00:00.000Z')
    `;
    await app`
      insert into public.terms_acceptances (user_id, terms_version_id)
      values (${userId}, ${versionId})
    `;
    await app`
      insert into public.age_declarations (user_id, declaration_version)
      values (${userId}, 'age-16-v1')
    `;
    await expect(app`insert into public.legal_document_versions (id, kind, version, content_digest) values ('forbidden', 'terms', 2, ${"c".repeat(64)})`)
      .rejects.toMatchObject({ code: "42501" });

    await migrator`set time zone 'America/New_York'`;
    try {
      await migrator`
        insert into public.account_purge_receipts
          (request_id, subject_digest, requested_at, completed_at, expires_at, completed_stage_count)
        values (${receiptId}, ${"d".repeat(64)}, '2026-03-04T22:00:00.000Z', '2026-03-07T22:00:00.000Z', '2026-04-06T22:00:00.000Z', 4)
      `;
      await expect(app`select request_id from public.account_purge_receipts where request_id = ${receiptId}`)
        .rejects.toMatchObject({ code: "42501" });
      await expect(migrator.begin((tx) => tx`
        update public.account_purge_receipts
        set expires_at = completed_at + interval '30 days'
        where request_id = ${receiptId}
      `)).rejects.toMatchObject({ code: "23514" });
    } finally {
      await migrator`set time zone 'UTC'`;
    }
  });

  it("denies app and lifecycle_worker direct physical purge access", async () => {
    const userId = await createUser("privileges");

    await expect(app`delete from public."user" where id = ${userId}`).rejects.toMatchObject({ code: "42501" });
    await expect(lifecycleWorker`select * from public.account_lifecycles`).rejects.toMatchObject({ code: "42501" });
    await expect(lifecycleWorker`delete from public."user" where id = ${userId}`).rejects.toMatchObject({ code: "42501" });
    await expect(app`select * from public.operator_cases`).rejects.toMatchObject({ code: "42501" });
  });
});
