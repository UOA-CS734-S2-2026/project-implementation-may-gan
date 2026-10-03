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
  const transitioning = `archive-transition-${nonce}`;
  const session = `archive-session-${nonce}`;
  const purgingSession = `archive-purge-session-${nonce}`;
  const transitionSession = `archive-transition-session-${nonce}`;
  const transitionRequest = `archive-transition-request-${nonce}`;
  const request = `archive-request-${nonce}`;
  const purgeRequest = `archive-purge-request-${nonce}`;
  const lease = `archive-lease-${nonce}`;
  const taskIds: string[] = [];

  beforeAll(async () => {
    await migrator`insert into public."user" (id, name, email) values
      (${owner}, 'Archive owner', ${`${owner}@example.test`}),
      (${purging}, 'Archive purge owner', ${`${purging}@example.test`}),
      (${transitioning}, 'Archive transition owner', ${`${transitioning}@example.test`})`;
    await migrator`insert into public.session (id, token, user_id, expires_at) values
      (${session}, ${`archive-token-${nonce}`}, ${owner}, '2090-01-01T00:00:00Z'),
      (${purgingSession}, ${`archive-purge-token-${nonce}`}, ${purging}, '2090-01-01T00:00:00Z'),
      (${transitionSession}, ${`archive-transition-token-${nonce}`}, ${transitioning}, '2090-01-01T00:00:00Z')`;
    await app`select * from public.request_account_export(${owner}, ${session}, ${request})`;
    await app`select * from public.request_account_export(${purging}, ${purgingSession}, ${purgeRequest})`;
    expect((await worker`select * from public.claim_account_exports(10, ${lease}, 120)`).map((row) => row.request_id))
      .toEqual(expect.arrayContaining([request, purgeRequest]));
  });

  afterAll(async () => {
    try {
      await migrator`delete from public."user" where id in (${owner}, ${purging}, ${transitioning})`;
      if (taskIds.length > 0) await migrator`delete from public.data_export_object_cleanup_tasks where id = any(${taskIds})`;
    } finally { await Promise.all([migrator.end(), app.end(), worker.end()]); }
  });

  it("records cleanup ownership before bytes and publishes only the current lease", async () => {
    await expect(app`select public.reserve_account_export_archive(${request}, ${lease})`).rejects.toThrow();
    await expect(app`select public.renew_account_export_lease(${request}, ${lease}, 120)`).rejects.toThrow();
    expect((await worker`select public.renew_account_export_lease(${request}, 'wrong-token', 120) as ok`)[0]?.ok)
      .toBe(false);
    expect((await worker`select public.renew_account_export_lease(${request}, ${lease}, 120) as ok`)[0]?.ok)
      .toBe(true);
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
    expect((await worker`select public.renew_account_export_lease(${request}, ${lease}, 120) as ok`)[0]?.ok)
      .toBe(false);
    expect((await migrator`select archive_object_key, snapshot_cutoff_at from public.data_export_requests where id = ${request}`)[0])
      .toMatchObject({ archive_object_key: reservation!.key });
    expect((await app`select * from public.authorize_account_export_download(${owner}, ${session}, ${request})`)[0])
      .toMatchObject({ archive_object_key: reservation!.key });
    expect(await app`select * from public.authorize_account_export_download(${owner}, ${purgingSession}, ${request})`).toEqual([]);
    expect(await app`select * from public.authorize_account_export_download(${purging}, ${purgingSession}, ${request})`).toEqual([]);
    await expect(worker`select * from public.authorize_account_export_download(${owner}, ${session}, ${request})`)
      .rejects.toThrow();
    await migrator`update public.data_export_requests set ready_at = now() - interval '24 hours 1 second',
      expires_at = now() - interval '1 second' where id = ${request}`;
    expect(await app`select * from public.authorize_account_export_download(${owner}, ${session}, ${request})`).toEqual([]);
    await expect(app`select * from public.claim_account_export_cleanup(1, 'wrong-role', 60)`).rejects.toThrow();
    expect((await worker`select public.expire_due_account_exports(1) as count`)[0]?.count).toBe(1);
    expect((await migrator`select status, archive_object_key, archive_cleanup_task_id
      from public.data_export_requests where id = ${request}`)[0]).toMatchObject({
      status: "expired", archive_object_key: null, archive_cleanup_task_id: task!.id,
    });
    const [first] = await worker<{ task_id: string; object_key: string; upload_id: string }[]>`
      select * from public.claim_account_export_cleanup(1, 'cleanup-lease-1', 60)`;
    expect(first).toMatchObject({ task_id: task!.id, object_key: reservation!.key, upload_id: "upload123" });
    expect((await worker`select public.finish_account_export_cleanup(${task!.id}, 'wrong-token') as ok`)[0]?.ok)
      .toBe(false);
    expect((await worker`select public.retry_account_export_cleanup(${task!.id}, 'cleanup-lease-1', 30) as ok`)[0]?.ok)
      .toBe(true);
    const [incident] = await migrator<{ id: string; failure_category: string; resolved_at: Date | null }[]>`
      select id, failure_category, resolved_at from public.data_export_cleanup_incidents`;
    expect(incident).toMatchObject({ id: expect.stringMatching(/^[0-9a-f]{64}$/), failure_category: "storage", resolved_at: null });
    expect(JSON.stringify(incident)).not.toContain(reservation!.key);
    await expect(app`select id from public.data_export_cleanup_incidents`).rejects.toThrow();
    await migrator`update public.data_export_object_cleanup_tasks set next_attempt_at = now() - interval '1 second'
      where id = ${task!.id}`;
    expect((await worker`select * from public.claim_account_export_cleanup(1, 'cleanup-lease-2', 60)`)[0]?.task_id)
      .toBe(task!.id);
    expect((await worker`select public.finish_account_export_cleanup(${task!.id}, 'cleanup-lease-2') as ok`)[0]?.ok)
      .toBe(true);
    expect(await migrator`select id from public.data_export_object_cleanup_tasks where id = ${task!.id}`).toHaveLength(1);
    await migrator`update public.data_export_object_cleanup_tasks
      set verified_absent_at = now() - interval '24 hours 1 second',
        next_attempt_at = now() - interval '1 second' where id = ${task!.id}`;
    expect((await worker`select * from public.claim_account_export_cleanup(1, 'cleanup-lease-3', 60)`)[0]?.task_id)
      .toBe(task!.id);
    expect((await worker`select public.finish_account_export_cleanup(${task!.id}, 'cleanup-lease-3') as ok`)[0]?.ok)
      .toBe(true);
    expect(await migrator`select id from public.data_export_requests where id = ${request}`).toHaveLength(0);
    expect(await migrator`select id from public.data_export_object_cleanup_tasks where id = ${task!.id}`).toHaveLength(0);
    const [resolved] = await migrator<{ resolved_at: Date; expires_at: Date }[]>`
      select resolved_at, expires_at from public.data_export_cleanup_incidents where id = ${incident!.id}`;
    expect(resolved!.expires_at.getTime() - resolved!.resolved_at.getTime()).toBe(30 * 24 * 3600_000);
    await expect(app`select public.delete_expired_account_export_incidents(100)`).rejects.toThrow();
    await migrator`update public.data_export_cleanup_incidents
      set first_failed_at = now() - interval '721 hours', last_failed_at = now() - interval '721 hours',
        resolved_at = now() - interval '720 hours 1 second', expires_at = now() - interval '1 second'
      where id = ${incident!.id}`;
    expect((await worker`select public.delete_expired_account_export_incidents(100) as count`)[0]?.count).toBe(1);
    expect(await migrator`select id from public.data_export_cleanup_incidents where id = ${incident!.id}`).toHaveLength(0);
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
    expect((await worker`select public.renew_account_export_lease(${purgeRequest}, ${lease}, 120) as ok`)[0]?.ok)
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

  it("clears a ready archive and advances cleanup in the purge transaction", async () => {
    await app`select * from public.request_account_export(${transitioning}, ${transitionSession}, ${transitionRequest})`;
    const token = `transition-lease-${nonce}`;
    expect((await worker`select * from public.claim_account_exports(1, ${token}, 120)`)[0]?.request_id)
      .toBe(transitionRequest);
    const [reservation] = await worker<{ key: string }[]>`
      select public.reserve_account_export_archive(${transitionRequest}, ${token}) as key`;
    expect(reservation?.key).toMatch(/^private\/data-exports\/v2\//);
    expect((await worker`select public.publish_account_export_archive(${transitionRequest}, ${token}, ${reservation!.key}) as ok`)[0]?.ok)
      .toBe(true);
    const [task] = await migrator<{ id: string }[]>`
      select id from public.data_export_object_cleanup_tasks where archive_object_key = ${reservation!.key}`;
    taskIds.push(task!.id);
    await migrator`insert into public.account_lifecycles
      (user_id, state, request_id, idempotency_key_digest, generation, requested_at, cancel_until, purge_due_at)
      values (${transitioning}, 'pending_deletion', ${`transition-delete-${nonce}`}, ${"b".repeat(64)}, 0,
        now() - interval '1 hour', now() + interval '167 hours', now() + interval '335 hours')`;
    expect(await app`select * from public.authorize_account_export_download(${transitioning}, ${transitionSession}, ${transitionRequest})`)
      .toHaveLength(1);
    let signalTransition = () => {};
    let releaseTransition = () => {};
    const transitioned = new Promise<void>((resolve) => { signalTransition = resolve; });
    const release = new Promise<void>((resolve) => { releaseTransition = resolve; });
    const transition = migrator.begin(async (transaction) => {
      try {
        await transaction`update public.account_lifecycles set state = 'purging', generation = 1,
          purge_started_at = now() where user_id = ${transitioning}`;
      } finally { signalTransition(); }
      await release;
    });
    await transitioned;
    const contendingDownload = Promise.resolve(app`
      select * from public.authorize_account_export_download(${transitioning}, ${transitionSession}, ${transitionRequest})`);
    releaseTransition();
    await transition;
    expect(await contendingDownload).toEqual([]);
    const [fenced] = await migrator<{ status: string; archive_object_key: string | null; archive_cleanup_task_id: string }[]>`
      select status, archive_object_key, archive_cleanup_task_id
      from public.data_export_requests where id = ${transitionRequest}`;
    expect(fenced).toMatchObject({ status: "cancelled", archive_object_key: null,
      archive_cleanup_task_id: task!.id });
    expect(await app`select * from public.authorize_account_export_download(${transitioning}, ${transitionSession}, ${transitionRequest})`)
      .toEqual([]);
    const [due] = await migrator<{ due: boolean }[]>`
      select next_attempt_at <= now() as due from public.data_export_object_cleanup_tasks where id = ${task!.id}`;
    expect(due?.due).toBe(true);
  });
});
