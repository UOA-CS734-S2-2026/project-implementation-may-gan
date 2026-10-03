import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const port = process.env.VERIFY_POSTGRES_PORT ?? "5433";
const migratorUrl = process.env.TEST_LIFECYCLE_DATABASE_URL;
const appUrl = process.env.TEST_LIFECYCLE_APP_DATABASE_URL;
const workerUrl = process.env.TEST_LIFECYCLE_WORKER_DATABASE_URL;
function local(value: string, role: string): string {
  const url = new URL(value);
  if (url.hostname !== "localhost" || url.port !== port || url.pathname !== "/dayli_lifecycle_test" || url.username !== role) {
    throw new Error("Export publication requires an isolated lifecycle database.");
  }
  return value;
}

(migratorUrl && appUrl && workerUrl ? describe : describe.skip)("lease-fenced archive publication", () => {
  const migrator = postgres(local(migratorUrl ?? `postgresql://migrator:migrator@localhost:${port}/dayli_lifecycle_test`, "migrator"), { max: 1 });
  const app = postgres(local(appUrl ?? `postgresql://app:app@localhost:${port}/dayli_lifecycle_test`, "app"), { max: 1 });
  const worker = postgres(local(workerUrl ?? `postgresql://lifecycle_worker:lifecycle_worker@localhost:${port}/dayli_lifecycle_test`, "lifecycle_worker"), { max: 1 });
  const nonce = crypto.randomUUID();
  const owner = `archive-owner-${nonce}`;
  const purging = `archive-purging-${nonce}`;
  const session = `archive-session-${nonce}`;
  const purgingSession = `archive-purge-session-${nonce}`;
  const request = `archive-request-${nonce}`;
  const purgeRequest = `archive-purge-request-${nonce}`;
  const lease = `archive-lease-${nonce}`;
  const taskIds: string[] = [];

  beforeAll(async () => {
    await migrator`insert into public."user" (id, name, email) values
      (${owner}, 'Archive owner', ${`${owner}@example.test`}),
      (${purging}, 'Archive purge owner', ${`${purging}@example.test`})`;
    await migrator`insert into public.session (id, token, user_id, expires_at) values
      (${session}, ${`archive-token-${nonce}`}, ${owner}, '2090-01-01T00:00:00Z'),
      (${purgingSession}, ${`archive-purge-token-${nonce}`}, ${purging}, '2090-01-01T00:00:00Z')`;
    await app`select * from public.request_account_export(${owner}, ${session}, ${request})`;
    await app`select * from public.request_account_export(${purging}, ${purgingSession}, ${purgeRequest})`;
    expect((await worker`select * from public.claim_account_exports(10, ${lease}, 120)`).map((row) => row.request_id))
      .toEqual(expect.arrayContaining([request, purgeRequest]));
  });

  afterAll(async () => {
    try {
      await migrator`delete from public."user" where id in (${owner}, ${purging})`;
      if (taskIds.length > 0) await migrator`delete from public.data_export_object_cleanup_tasks where id = any(${taskIds})`;
    } finally { await Promise.all([migrator.end(), app.end(), worker.end()]); }
  });

  it("records cleanup ownership before bytes and publishes only the current lease", async () => {
    await expect(app`select public.reserve_account_export_archive(${request}, ${lease})`).rejects.toThrow();
    const [reservation] = await worker<{ key: string }[]>`
      select public.reserve_account_export_archive(${request}, ${lease}) as key`;
    expect(reservation?.key).toMatch(/^private\/data-exports\/v2\/[0-9a-f]{64}\/[0-9a-f]{64}\.zip$/);
    expect((await worker`select public.reserve_account_export_archive(${request}, ${lease}) as key`)[0]?.key)
      .toBe(reservation?.key);
    const [task] = await migrator<{ id: string; archive_object_key: string; status: string }[]>`
      select id, archive_object_key, status from public.data_export_object_cleanup_tasks
      where archive_object_key = ${reservation!.key}`;
    expect(task).toMatchObject({ archive_object_key: reservation!.key, status: "pending" });
    taskIds.push(task!.id);
    await expect(app`select public.register_account_export_upload(${request}, ${lease}, ${reservation!.key}, 'upload123')`).rejects.toThrow();
    expect((await worker`select public.register_account_export_upload(${request}, 'wrong-token', ${reservation!.key}, 'upload123') as ok`)[0]?.ok)
      .toBe(false);
    expect((await worker`select public.register_account_export_upload(${request}, ${lease}, ${reservation!.key}, 'upload123') as ok`)[0]?.ok)
      .toBe(true);
    expect((await worker`select public.register_account_export_upload(${request}, ${lease}, ${reservation!.key}, 'upload123') as ok`)[0]?.ok)
      .toBe(true);
    expect((await worker`select public.register_account_export_upload(${request}, ${lease}, ${reservation!.key}, 'other-upload') as ok`)[0]?.ok)
      .toBe(false);
    expect((await migrator`select upload_id from public.data_export_object_cleanup_tasks where id = ${task!.id}`)[0]?.upload_id)
      .toBe('upload123');
    expect((await worker`select public.publish_account_export_archive(${request}, 'wrong-token', ${reservation!.key}) as ok`)[0]?.ok)
      .toBe(false);
    expect((await worker`select public.publish_account_export_archive(${request}, ${lease}, 'private/unowned.zip') as ok`)[0]?.ok)
      .toBe(false);
    expect((await worker`select public.publish_account_export_archive(${request}, ${lease}, ${reservation!.key}) as ok`)[0]?.ok)
      .toBe(true);
    expect((await worker`select public.publish_account_export_archive(${request}, ${lease}, ${reservation!.key}) as ok`)[0]?.ok)
      .toBe(false);
    const [ready] = await app<{ request_status: string; ready_at: Date; expires_at: Date }[]>`
      select * from public.read_account_export_status(${owner}, ${session})`;
    expect(ready?.request_status).toBe("ready");
    expect(ready!.expires_at.getTime() - ready!.ready_at.getTime()).toBe(24 * 3600_000);
    expect(await worker`select * from public.authorize_account_export_lease(${request}, ${lease})`).toEqual([]);
    expect((await migrator`select archive_object_key, snapshot_cutoff_at from public.data_export_requests where id = ${request}`)[0])
      .toMatchObject({ archive_object_key: reservation!.key });
  });

  it("refuses to publish an archive after irreversible purge begins", async () => {
    const [reservation] = await worker<{ key: string }[]>`
      select public.reserve_account_export_archive(${purgeRequest}, ${lease}) as key`;
    expect(reservation?.key).toMatch(/^private\/data-exports\/v2\//);
    const [task] = await migrator<{ id: string }[]>`
      select id from public.data_export_object_cleanup_tasks where archive_object_key = ${reservation!.key}`;
    taskIds.push(task!.id);
    await migrator`insert into public.account_lifecycles
      (user_id, state, request_id, idempotency_key_digest, generation, requested_at, cancel_until,
        purge_due_at, purge_started_at)
      values (${purging}, 'purging', ${`deletion-${nonce}`}, ${"a".repeat(64)}, 1,
        now() - interval '20 days', now() - interval '13 days', now() - interval '6 days', now())`;
    expect((await worker`select public.publish_account_export_archive(${purgeRequest}, ${lease}, ${reservation!.key}) as ok`)[0]?.ok)
      .toBe(false);
    expect(await app`select * from public.read_account_export_status(${purging}, ${purgingSession})`).toEqual([]);
    expect((await migrator`select status from public.data_export_object_cleanup_tasks where id = ${task!.id}`)[0]?.status)
      .toBe("pending");
    expect((await worker`select public.fail_account_export_build(${purgeRequest}, 'wrong-token', 'source') as ok`)[0]?.ok)
      .toBe(false);
    expect((await worker`select public.fail_account_export_build(${purgeRequest}, ${lease}, 'source') as ok`)[0]?.ok)
      .toBe(true);
    const [cleanup] = await migrator<{ due: boolean; status: string }[]>`
      select next_attempt_at <= now() as due, status from public.data_export_object_cleanup_tasks where id = ${task!.id}`;
    expect(cleanup).toMatchObject({ due: true, status: "pending" });
  });
});
