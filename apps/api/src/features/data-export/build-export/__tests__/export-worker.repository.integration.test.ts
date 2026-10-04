import postgres from "postgres";
import { createDayliDatabase } from "@dayli/db";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createRestrictedExportFileSource, createRestrictedExportRecordSource } from "../export-source.repository";
import { createExportBuildStore } from "../export-worker.repository";
import { createExportWorker } from "../export-worker";
import type { ExportArchiveStore } from "../../shared/export-r2-archive";
import { createExportCleanupStore } from "../../shared/export-cleanup.repository";
import { createExportCleanupDispatcher } from "../../shared/export-cleanup";
import { createExportOwnerRepository } from "../../shared/export-owner.repository";
import { authorizeExportDownload } from "../../shared/export-download.repository";
import { prepareExportDownload } from "../../shared/export-download";

const port = process.env.VERIFY_POSTGRES_PORT ?? "5433";
const migratorUrl = process.env.TEST_LIFECYCLE_DATABASE_URL;
const appUrl = process.env.TEST_LIFECYCLE_APP_DATABASE_URL;
const workerUrl = process.env.TEST_LIFECYCLE_WORKER_DATABASE_URL;
function isolated(value: string, role: string) {
  const url = new URL(value);
  if (url.hostname !== "localhost" || url.port !== port || url.pathname !== "/dayli_lifecycle_test" || url.username !== role) {
    throw new Error("Export worker tests require the isolated lifecycle database.");
  }
  return value;
}

(migratorUrl && appUrl && workerUrl ? describe : describe.skip)("restricted export build", () => {
  const migrator = postgres(isolated(migratorUrl ?? `postgresql://migrator:migrator@localhost:${port}/dayli_lifecycle_test`, "migrator"));
  const app = postgres(isolated(appUrl ?? `postgresql://app:app@localhost:${port}/dayli_lifecycle_test`, "app"));
  const worker = createDayliDatabase(isolated(workerUrl ?? `postgresql://lifecycle_worker:lifecycle_worker@localhost:${port}/dayli_lifecycle_test`, "lifecycle_worker"));
  const appDatabase = createDayliDatabase(isolated(appUrl ?? `postgresql://app:app@localhost:${port}/dayli_lifecycle_test`, "app"));
  const nonce = crypto.randomUUID();
  const owner = `build-owner-${nonce}`;
  const session = `build-session-${nonce}`;
  const request = `build-request-${nonce}`;
  const zipParts: Uint8Array[] = [];
  const objects: ExportArchiveStore = {
    begin: vi.fn(async () => "upload1"),
    uploadPart: vi.fn(async (_key, _id, _part, bytes) => { zipParts.push(bytes); return '"etag"'; }),
    complete: vi.fn(async () => {}), abort: vi.fn(async () => {}), listUploads: vi.fn(async () => []),
    remove: vi.fn(async () => {}), exists: vi.fn(async () => false), head: vi.fn(async () => ({ size: 100, etag: '"etag"' })),
    readRange: vi.fn(async () => new Uint8Array()),
  };
  beforeAll(async () => {
    await migrator`insert into public."user" (id, name, email)
      values (${owner}, 'Export ZIP owner', ${`${owner}@example.test`})`;
    await migrator`insert into public.session (id, token, user_id, expires_at)
      values (${session}, ${`build-token-${nonce}`}, ${owner}, '2090-01-01T00:00:00Z')`;
    await app`select * from public.request_account_export(${owner}, ${session}, ${request})`;
  });
  afterAll(async () => {
    try {
      const tasks = await migrator<{ id: string }[]>`
        select task.id from public.data_export_object_cleanup_tasks task
          join public.data_export_requests requests on requests.archive_object_key = task.archive_object_key
        where requests.id = ${request}`;
      await migrator`delete from public."user" where id = ${owner}`;
      for (const task of tasks) await migrator`delete from public.data_export_object_cleanup_tasks where id = ${task.id}`;
    } finally { await Promise.all([migrator.end(), app.end(), worker.close(), appDatabase.close()]); }
  });

  it("builds a bounded private ZIP under the restricted role and publishes through the lease", async () => {
    // The reservation key is derived by the database, never the test worker.
    const store = createExportBuildStore(worker.db);
    const failures: Array<{ category: string; stage: string; sqlState?: string }> = [];
    const workerJob = createExportWorker({ store,
      records: createRestrictedExportRecordSource(worker.db),
      files: createRestrictedExportFileSource(worker.db, { read: async () => { throw new Error("Unexpected media read."); } }),
      objects,
      createToken: () => `build-lease-${nonce}`,
      onFailure: (failure) => failures.push(failure),
    });
    const build = await workerJob.runOnce();
    expect({ build, failures }).toEqual({ build: { outcome: "ready" }, failures: [] });
    const [row] = await app<{ request_status: string }[]>`select * from public.read_account_export_status(${owner}, ${session})`;
    expect(row?.request_status).toBe("ready");
    expect(zipParts.length).toBeGreaterThan(0);
    const combined = Buffer.concat(zipParts.map((part) => Buffer.from(part)));
    expect(combined.subarray(0, 4).toString("hex")).toBe("504b0304");
    expect(combined.toString()).toContain("per_source_selection_cutoff_not_atomic_snapshot");
    expect(combined.toString()).toContain(owner);
    expect(combined.toString()).not.toContain(`build-token-${nonce}`);
    const status = await createExportOwnerRepository(appDatabase.db).status(owner, session);
    expect(status).toMatchObject({ requestId: request, status: "ready" });
    const archiveKey = await authorizeExportDownload(appDatabase.db, { userId: owner, sessionId: session, requestId: request });
    expect(archiveKey).toMatch(/^private\/data-exports\/v2\//);
    expect(await authorizeExportDownload(appDatabase.db, { userId: owner, sessionId: "wrong-session", requestId: request }))
      .toBeNull();
    vi.mocked(objects.head).mockResolvedValue({ size: combined.byteLength, etag: '"etag"' });
    vi.mocked(objects.readRange).mockImplementation(async (_key, start, end) => combined.subarray(start, end + 1));
    const download = await prepareExportDownload({
      authorize: () => authorizeExportDownload(appDatabase.db, { userId: owner, sessionId: session, requestId: request }),
      objects,
    });
    expect(Buffer.from(await new Response(download!.body).arrayBuffer())).toEqual(combined);
    await expect(app`select public.reserve_account_export_archive(${request}, 'wrong-token')`).rejects.toThrow();
  });

  it("expires access and performs two durable provider reconciliation passes", async () => {
    await migrator`update public.data_export_requests set ready_at = now() - interval '24 hours 1 second',
      expires_at = now() - interval '1 second' where id = ${request}`;
    const cleanup = createExportCleanupDispatcher({ store: createExportCleanupStore(worker.db), objects,
      createToken: () => `cleanup-lease-${nonce}` });
    expect(await authorizeExportDownload(appDatabase.db, { userId: owner, sessionId: session, requestId: request }))
      .toBeNull();
    const first = await cleanup.runOnce();
    expect(first).toMatchObject({ expired: 1, claimed: 1, confirmed: 1 });
    expect(objects.abort).toHaveBeenCalledWith(expect.stringMatching(/^private\/data-exports\/v2\//), "upload1");
    expect(await app`select * from public.authorize_account_export_download(${owner}, ${session}, ${request})`).toEqual([]);
    const [task] = await migrator<{ id: string }[]>`
      select archive_cleanup_task_id as id from public.data_export_requests where id = ${request}`;
    expect(task?.id).toBeTruthy();
    await migrator`update public.data_export_object_cleanup_tasks
      set verified_absent_at = now() - interval '24 hours 1 second', next_attempt_at = now() - interval '1 second'
      where id = ${task!.id}`;
    const second = await cleanup.runOnce();
    expect(second).toMatchObject({ expired: 0, claimed: 1, confirmed: 1 });
    expect(await migrator`select id from public.data_export_requests where id = ${request}`).toHaveLength(0);
    expect(await migrator`select id from public.data_export_object_cleanup_tasks where id = ${task!.id}`).toHaveLength(0);
  });
});
