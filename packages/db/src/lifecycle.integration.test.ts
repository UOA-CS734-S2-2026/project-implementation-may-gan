import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const migratorUrl = process.env.TEST_DATABASE_URL;
const appUrl = process.env.TEST_APP_DATABASE_URL;
const lifecycleWorkerUrl = process.env.TEST_LIFECYCLE_WORKER_DATABASE_URL;
const enabled = Boolean(migratorUrl && appUrl && lifecycleWorkerUrl);

function requireLocalTestUrl(value: string | undefined, name: string, user: string): string {
  if (!value) throw new Error(`${name} is required for lifecycle database integration tests.`);
  const url = new URL(value);
  if (url.hostname !== "localhost" || url.port !== "5433" || url.pathname !== "/dayli_test" || url.username !== user) {
    throw new Error(`${name} must target ${user}@localhost:5433/dayli_test.`);
  }
  return value;
}

(enabled ? describe : describe.skip)("lifecycle schema and least-privilege integration", () => {
  const migratorConnection = requireLocalTestUrl(migratorUrl ?? "postgresql://migrator:migrator@localhost:5433/dayli_test", "TEST_DATABASE_URL", "migrator");
  const appConnection = requireLocalTestUrl(appUrl ?? "postgresql://app:app@localhost:5433/dayli_test", "TEST_APP_DATABASE_URL", "app");
  const lifecycleWorkerConnection = requireLocalTestUrl(lifecycleWorkerUrl ?? "postgresql://lifecycle_worker:lifecycle_worker@localhost:5433/dayli_test", "TEST_LIFECYCLE_WORKER_DATABASE_URL", "lifecycle_worker");
  const migrator = postgres(migratorConnection, { max: 1, prepare: false, onnotice: () => undefined });
  const app = postgres(appConnection, { max: 1, prepare: false, onnotice: () => undefined });
  const lifecycleWorker = postgres(lifecycleWorkerConnection, { max: 1, prepare: false, onnotice: () => undefined });
  const users: string[] = [];
  const legalVersions: string[] = [];
  const receipts: string[] = [];

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
      if (legalVersions.length > 0) await migrator`delete from public.legal_document_versions where id = any(${legalVersions})`;
    } finally {
      await migrator.end({ timeout: 5 });
      await app.end({ timeout: 5 });
      await lifecycleWorker.end({ timeout: 5 });
    }
  });

  it("enforces exact seven-day and fourteen-day lifecycle boundaries", async () => {
    const userId = await createUser("deadlines");
    const requestId = `request-${crypto.randomUUID()}`;
    const digest = "a".repeat(64);
    const requestedAt = "2026-09-30T03:26:07.000Z";

    await app`insert into public.account_lifecycles (user_id) values (${userId})`;
    await app`
      update public.account_lifecycles
      set state = 'pending_deletion', request_id = ${requestId}, idempotency_key_digest = ${digest},
          generation = 1, requested_at = ${requestedAt}, cancel_until = ${"2026-10-07T03:26:07.000Z"},
          purge_due_at = ${"2026-10-14T03:26:07.000Z"}
      where user_id = ${userId}
    `;

    const rows = await migrator`
      select state, requested_at::text, cancel_until::text, purge_due_at::text, generation
      from public.account_lifecycles where user_id = ${userId}
    `;
    expect(rows).toEqual([{
      state: "pending_deletion",
      requested_at: "2026-09-30 03:26:07+00",
      cancel_until: "2026-10-07 03:26:07+00",
      purge_due_at: "2026-10-14 03:26:07+00",
      generation: "1",
    }]);

    await expect(app.begin((tx) => tx`
      update public.account_lifecycles
      set cancel_until = '2026-10-07T03:26:07.001Z'
      where user_id = ${userId}
    `)).rejects.toMatchObject({ code: "23514" });
  });

  it("fences export lifecycle generations and enforces the 24-hour archive expiry", async () => {
    const userId = await createUser("export");
    const firstId = `export-${crypto.randomUUID()}`;
    const secondId = `export-${crypto.randomUUID()}`;
    const requestedAt = "2026-09-30T03:26:07.000Z";
    const readyAt = "2026-09-30T05:26:07.000Z";

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
          ready_at = ${readyAt}, expires_at = '2026-10-01T05:26:07.000Z'
      where id = ${firstId}
    `;
    await expect(app.begin((tx) => tx`
      update public.data_export_requests
      set expires_at = '2026-10-01T05:26:07.001Z'
      where id = ${firstId}
    `)).rejects.toMatchObject({ code: "23514" });
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

    await migrator`
      insert into public.account_purge_receipts
        (request_id, subject_digest, requested_at, completed_at, expires_at, completed_stage_count)
      values (${receiptId}, ${"d".repeat(64)}, '2026-09-30T03:26:07.000Z', '2026-10-14T03:26:07.000Z', '2026-11-13T03:26:07.000Z', 4)
    `;
    await expect(app`select request_id from public.account_purge_receipts where request_id = ${receiptId}`)
      .rejects.toMatchObject({ code: "42501" });
    await expect(migrator.begin((tx) => tx`
      update public.account_purge_receipts
      set expires_at = '2026-11-13T03:26:07.001Z'
      where request_id = ${receiptId}
    `)).rejects.toMatchObject({ code: "23514" });
  });

  it("denies app and lifecycle_worker direct physical purge access", async () => {
    const userId = await createUser("privileges");

    await expect(app`delete from public."user" where id = ${userId}`).rejects.toMatchObject({ code: "42501" });
    await expect(lifecycleWorker`select * from public.account_lifecycles`).rejects.toMatchObject({ code: "42501" });
    await expect(lifecycleWorker`delete from public."user" where id = ${userId}`).rejects.toMatchObject({ code: "42501" });
    await expect(app`select * from public.operator_cases`).rejects.toMatchObject({ code: "42501" });
  });
});
