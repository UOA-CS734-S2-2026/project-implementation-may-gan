import postgres from "postgres";
import { createDayliDatabase } from "@dayli/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createExportBuildStore } from "../export-worker.repository";
import { createExportCleanupStore } from "../../shared/export-cleanup.repository";
import { createExportCleanupDispatcher } from "../../shared/export-cleanup";
import { readStagingExportProof } from "../../shared/export-activation";

const port = process.env.VERIFY_POSTGRES_PORT ?? "5433";
const migratorUrl = process.env.TEST_LIFECYCLE_DATABASE_URL;
const appUrl = process.env.TEST_LIFECYCLE_APP_DATABASE_URL;
const workerUrl = process.env.TEST_LIFECYCLE_WORKER_DATABASE_URL;
function isolated(value: string, role: string) {
  const url = new URL(value);
  if (url.hostname !== "localhost" || url.port !== port || url.pathname !== "/dayli_lifecycle_test" || url.username !== role) {
    throw new Error("Staging proof tests require an isolated lifecycle database.");
  }
  return value;
}

(migratorUrl && appUrl && workerUrl ? describe : describe.skip)("synthetic owner scoped export work", () => {
  const migrator = postgres(isolated(migratorUrl ?? `postgresql://migrator:migrator@localhost:${port}/dayli_lifecycle_test`, "migrator"));
  const app = postgres(isolated(appUrl ?? `postgresql://app:app@localhost:${port}/dayli_lifecycle_test`, "app"));
  const worker = createDayliDatabase(isolated(workerUrl ?? `postgresql://lifecycle_worker:lifecycle_worker@localhost:${port}/dayli_lifecycle_test`, "lifecycle_worker"));
  const nonce = crypto.randomUUID();
  const proofOwner = `proof-owner-${nonce}`;
  const otherOwner = `unrelated-owner-${nonce}`;
  const proofSession = `proof-session-${nonce}`;
  const otherSession = `unrelated-session-${nonce}`;
  const proofRequest = `proof-request-${nonce}`;
  const otherRequest = `unrelated-request-${nonce}`;
  const proofLease = `proof-lease-${nonce}`;
  const otherLease = `unrelated-lease-${nonce}`;

  beforeAll(async () => {
    await migrator`insert into public."user" (id, name, email) values
      (${proofOwner}, 'Synthetic proof', ${`${proofOwner}@example.test`}),
      (${otherOwner}, 'Unrelated synthetic', ${`${otherOwner}@example.test`})`;
    await migrator`insert into public.session (id, token, user_id, expires_at) values
      (${proofSession}, ${`proof-token-${nonce}`}, ${proofOwner}, '2090-01-01T00:00:00Z'),
      (${otherSession}, ${`unrelated-token-${nonce}`}, ${otherOwner}, '2090-01-01T00:00:00Z')`;
    await app`select * from public.request_account_export(${proofOwner}, ${proofSession}, ${proofRequest})`;
    await app`select * from public.request_account_export(${otherOwner}, ${otherSession}, ${otherRequest})`;
  });

  afterAll(async () => {
    try {
      const tasks = await migrator<{ id: string }[]>`select id from public.data_export_object_cleanup_tasks
        where split_part(archive_object_key, '/', 4) in (
          encode(sha256(convert_to(${proofRequest}, 'UTF8')), 'hex'),
          encode(sha256(convert_to(${otherRequest}, 'UTF8')), 'hex'))`;
      await migrator`delete from public."user" where id in (${proofOwner}, ${otherOwner})`;
      for (const task of tasks) {
        await migrator`delete from public.data_export_object_cleanup_tasks where id = ${task.id}`;
      }
    } finally { await Promise.all([migrator.end(), app.end(), worker.close()]); }
  });

  it("lets only lifecycle_worker claim the selected owner", async () => {
    await expect(app`select * from public.claim_account_exports_for_owner(${proofOwner}, 1, ${proofLease}, 120)`)
      .rejects.toThrow();
    const proofStore = createExportBuildStore(worker.db, proofOwner);
    const claim = await proofStore.claim(proofLease, 120);
    expect(claim?.requestId).toBe(proofRequest);
    const [unrelated] = await migrator<{ status: string }[]>`
      select status from public.data_export_requests where id = ${otherRequest}`;
    expect(unrelated?.status).toBe("requested");
    expect(await proofStore.claim(`again-${nonce}`, 120)).toBeNull();
  });

  it("scopes expiry and cleanup claims to the synthetic owner", async () => {
    const proofStore = createExportBuildStore(worker.db, proofOwner);
    const otherStore = createExportBuildStore(worker.db, otherOwner);
    const otherClaim = await otherStore.claim(otherLease, 120);
    expect(otherClaim?.requestId).toBe(otherRequest);
    const proofSelection = { requestId: proofRequest, leaseToken: proofLease, selectionCutoffAt: new Date() };
    const otherSelection = { requestId: otherRequest, leaseToken: otherLease, selectionCutoffAt: new Date() };
    const proofKey = await proofStore.reserve(proofSelection);
    const otherKey = await otherStore.reserve(otherSelection);
    expect(proofKey).toMatch(/^private\/data-exports\/v2\//);
    expect(otherKey).toMatch(/^private\/data-exports\/v2\//);
    expect(await proofStore.register(proofSelection, proofKey!, "proof-upload")).toBe(true);
    expect(await otherStore.register(otherSelection, otherKey!, "other-upload")).toBe(true);
    expect(await proofStore.publish(proofSelection, proofKey!)).toBe(true);
    expect(await otherStore.publish(otherSelection, otherKey!)).toBe(true);
    await migrator`update public.data_export_requests set ready_at = now() - interval '24 hours 1 second',
      expires_at = now() - interval '1 second' where id in (${proofRequest}, ${otherRequest})`;

    const proofCleanup = createExportCleanupStore(worker.db, proofOwner);
    expect(await proofCleanup.expire(10)).toBe(1);
    expect((await migrator<{ status: string }[]>`select status from public.data_export_requests where id = ${otherRequest}`)[0]?.status)
      .toBe("ready");
    const otherCleanup = createExportCleanupStore(worker.db, otherOwner);
    expect(await otherCleanup.expire(10)).toBe(1);
    const task = await proofCleanup.claim(`proof-cleanup-${nonce}`, 120);
    expect(task?.key).toBe(proofKey);
    expect(await proofCleanup.claim(`proof-cleanup-again-${nonce}`, 120)).toBeNull();
    expect((await migrator<{ status: string }[]>`
      select status from public.data_export_object_cleanup_tasks where archive_object_key = ${otherKey!}`)[0]?.status)
      .toBe("pending");
    expect(await proofCleanup.retry(task!.taskId, `proof-cleanup-${nonce}`, 60)).toBe(true);
    await migrator`update public.data_export_object_cleanup_tasks set next_attempt_at = now() - interval '1 second'
      where id = ${task!.taskId}`;

    // Publication at the build cutoff leaves only the 24-hour archive expiry
    // and the 24-hour second-pass wait. The review time cannot turn cleanup off.
    const buildUntil = Date.now() - 24 * 3600_000;
    const reviewAfter = buildUntil + 48 * 3600_000;
    const proofEnv = {
      API_RATE_LIMIT_SCOPE: "staging",
      EXPORT_WORKER_HYPERDRIVE: { connectionString: "postgres://synthetic.test" },
      STAGING_EXPORT_PROOF_APPROVED: "synthetic-only",
      STAGING_EXPORT_PROOF_USER_ID: proofOwner,
      STAGING_EXPORT_PROOF_BUILD_UNTIL: new Date(buildUntil).toISOString(),
      STAGING_EXPORT_PROOF_CLEANUP_REVIEW_AFTER: new Date(reviewAfter).toISOString(),
    };
    const cleanup = createExportCleanupDispatcher({ store: proofCleanup, objects: {
      abort: async () => {}, listUploads: async () => [], remove: async () => {}, exists: async () => false,
    }, createToken: () => `second-pass-${nonce}` });
    expect(readStagingExportProof(proofEnv, buildUntil + 24 * 3600_000)?.cleanupEnabled).toBe(true);
    expect((await cleanup.runOnce()).confirmed).toBe(1);
    await migrator`update public.data_export_object_cleanup_tasks
      set verified_absent_at = now() - interval '24 hours 1 second', next_attempt_at = now() - interval '1 second'
      where id = ${task!.taskId}`;
    expect(readStagingExportProof(proofEnv, reviewAfter)?.cleanupEnabled).toBe(true);
    expect(readStagingExportProof(proofEnv, reviewAfter + 60_000)?.cleanupEnabled).toBe(true);
    expect((await cleanup.runOnce()).confirmed).toBe(1);
    expect(await migrator`select id from public.data_export_object_cleanup_tasks where id = ${task!.taskId}`).toEqual([]);
    expect((await migrator<{ status: string }[]>`
      select status from public.data_export_object_cleanup_tasks where archive_object_key = ${otherKey!}`)[0]?.status)
      .toBe("pending");
  });
});
