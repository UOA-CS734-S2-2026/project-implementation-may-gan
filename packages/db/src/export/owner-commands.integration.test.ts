import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const port = process.env.VERIFY_POSTGRES_PORT ?? "5433";
const migratorUrl = process.env.TEST_LIFECYCLE_DATABASE_URL;
const appUrl = process.env.TEST_LIFECYCLE_APP_DATABASE_URL;
const workerUrl = process.env.TEST_LIFECYCLE_WORKER_DATABASE_URL;
function localUrl(value: string, role: string): string {
  const url = new URL(value);
  if (url.hostname !== "localhost" || url.port !== port || url.pathname !== "/dayli_lifecycle_test" || url.username !== role) {
    throw new Error("Export owner tests require an isolated lifecycle database.");
  }
  return value;
}

(migratorUrl && appUrl && workerUrl ? describe : describe.skip)("session-bound export owner commands", () => {
  const migrator = postgres(localUrl(migratorUrl ?? `postgresql://migrator:migrator@localhost:${port}/dayli_lifecycle_test`, "migrator"), { max: 1 });
  const app = postgres(localUrl(appUrl ?? `postgresql://app:app@localhost:${port}/dayli_lifecycle_test`, "app"), { max: 1 });
  const worker = postgres(localUrl(workerUrl ?? `postgresql://lifecycle_worker:lifecycle_worker@localhost:${port}/dayli_lifecycle_test`, "lifecycle_worker"), { max: 1 });
  const suffix = crypto.randomUUID();
  const owner = `export-owner-${suffix}`;
  const outsider = `export-outsider-${suffix}`;
  const session = `export-session-${suffix}`;
  const outsiderSession = `export-other-session-${suffix}`;
  const expiryOwner = `export-expiry-${suffix}`;
  const generationOwner = `export-generation-${suffix}`;
  const expirySession = `export-expiry-session-${suffix}`;
  const generationSession = `export-generation-session-${suffix}`;
  let cleanupId: string | undefined;

  async function seed() {
    await migrator`insert into public."user" (id, name, email) values
      (${owner}, 'Export owner', ${`${owner}@example.test`}),
      (${outsider}, 'Export outsider', ${`${outsider}@example.test`}),
      (${expiryOwner}, 'Export expiry owner', ${`${expiryOwner}@example.test`}),
      (${generationOwner}, 'Export generation owner', ${`${generationOwner}@example.test`})`;
    await migrator`insert into public.session (id, token, user_id, expires_at) values
      (${session}, ${`token-${suffix}`}, ${owner}, '2090-01-01T00:00:00Z'),
      (${outsiderSession}, ${`other-token-${suffix}`}, ${outsider}, '2090-01-01T00:00:00Z'),
      (${expirySession}, ${`expiry-token-${suffix}`}, ${expiryOwner}, '2090-01-01T00:00:00Z'),
      (${generationSession}, ${`generation-token-${suffix}`}, ${generationOwner}, '2090-01-01T00:00:00Z')`;
  }

  beforeAll(seed);

  afterAll(async () => {
    try {
      await migrator`delete from public."user" where id in (${owner}, ${outsider}, ${expiryOwner}, ${generationOwner})`;
      if (cleanupId) await migrator`delete from public.data_export_object_cleanup_tasks where id = ${cleanupId}`;
    } finally { await Promise.all([migrator.end(), app.end(), worker.end()]); }
  });

  it("denies direct request-table reads and cross-session calls", async () => {
    const [permissions] = await migrator<{ direct_read: boolean; can_request: boolean; can_read: boolean }[]>`
      select has_table_privilege('app', 'public.data_export_requests', 'SELECT') as direct_read,
        has_function_privilege('app', 'public.request_account_export(text,text,text)', 'EXECUTE') as can_request,
        has_function_privilege('app', 'public.read_account_export_status(text,text)', 'EXECUTE') as can_read`;
    expect(permissions).toMatchObject({ direct_read: false, can_request: true, can_read: true });
    await expect(app`select * from public.data_export_requests limit 1`).rejects.toThrow();
    expect(await app`select * from public.request_account_export(${owner}, ${outsiderSession}, ${`export-${suffix}`})`).toEqual([]);
    expect(await app`select * from public.read_account_export_status(${owner}, ${outsiderSession})`).toEqual([]);
  });

  it("creates one owner request, omits private keys, and fences irreversible deletion", async () => {
    const firstId = `export-${suffix}`;
    const [first] = await app<{ request_id: string; request_status: string; requested_at: Date }[]>`
      select * from public.request_account_export(${owner}, ${session}, ${firstId})`;
    expect(first).toMatchObject({ request_id: firstId, request_status: "requested" });
    const [duplicate] = await app`select * from public.request_account_export(${owner}, ${session}, ${`different-${suffix}`})`;
    expect(duplicate).toMatchObject({ request_id: firstId, request_status: "requested" });
    const [status] = await app`select * from public.read_account_export_status(${owner}, ${session})`;
    expect(status).toMatchObject({ request_id: firstId, request_status: "requested", ready_at: null, expires_at: null });
    expect(Object.keys(status ?? {}).sort()).toEqual(["expires_at", "ready_at", "request_id", "request_status", "requested_at"]);
    const digest = "e".repeat(64);
    await migrator`insert into public.account_lifecycles
      (user_id, state, request_id, idempotency_key_digest, generation, requested_at, cancel_until, purge_due_at)
      values (${owner}, 'pending_deletion', ${`deletion-${suffix}`}, ${digest}, 1,
        now(), now() + interval '168 hours', now() + interval '336 hours')`;
    // A pending account retains management access, but the previous generation is fenced.
    expect(await app`select * from public.read_account_export_status(${owner}, ${session})`).toEqual([]);
    const [pending] = await app`select * from public.request_account_export(${owner}, ${session}, ${`pending-${suffix}`})`;
    expect(pending?.request_id).toBe(`pending-${suffix}`);
    await migrator`update public.account_lifecycles
      set state = 'purging', purge_started_at = now(), generation = 2 where user_id = ${owner}`;
    expect(await app`select * from public.read_account_export_status(${owner}, ${session})`).toEqual([]);
    expect(await app`select * from public.request_account_export(${owner}, ${session}, ${`late-${suffix}`})`).toEqual([]);
  });

  it("reconciles an expired archive into durable cleanup before a new request", async () => {
    const oldId = `expired-${suffix}`;
    const archive = `private/data-exports/v2/${expiryOwner}/${oldId}.zip`;
    await app`select * from public.request_account_export(${expiryOwner}, ${expirySession}, ${oldId})`;
    await migrator`update public.data_export_requests
      set status = 'ready', snapshot_cutoff_at = now() - interval '50 hours',
        archive_object_key = ${archive}, ready_at = now() - interval '25 hours',
        expires_at = now() - interval '1 hour' where id = ${oldId}`;
    expect((await app`select * from public.read_account_export_status(${expiryOwner}, ${expirySession})`)[0])
      .toMatchObject({ request_id: oldId, request_status: "expired", ready_at: null, expires_at: null });
    const [next] = await app`select * from public.request_account_export(${expiryOwner}, ${expirySession}, ${`next-${suffix}`})`;
    expect(next?.request_id).toBe(`next-${suffix}`);
    const [previous] = await migrator<{ status: string; archive_cleanup_task_id: string; archive_object_key: string | null }[]>`
      select status, archive_cleanup_task_id, archive_object_key from public.data_export_requests where id = ${oldId}`;
    expect(previous).toMatchObject({ status: "expired", archive_object_key: null });
    cleanupId = previous!.archive_cleanup_task_id;
    const [cleanup] = await migrator`select archive_object_key, status from public.data_export_object_cleanup_tasks where id = ${cleanupId}`;
    expect(cleanup).toMatchObject({ archive_object_key: archive, status: "pending" });
  });

  it("fences a stale generation without leaking status", async () => {
    const oldId = `generation-old-${suffix}`;
    await app`select * from public.request_account_export(${generationOwner}, ${generationSession}, ${oldId})`;
    await migrator`insert into public.account_lifecycles (user_id, generation) values (${generationOwner}, 1)`;
    expect(await app`select * from public.read_account_export_status(${generationOwner}, ${generationSession})`).toEqual([]);
    const [next] = await app`select * from public.request_account_export(${generationOwner}, ${generationSession}, ${`generation-new-${suffix}`})`;
    expect(next?.request_id).toBe(`generation-new-${suffix}`);
    const [old] = await migrator`select status from public.data_export_requests where id = ${oldId}`;
    expect(old?.status).toBe("cancelled");
  });

  it("claims with a restricted worker lease and denies stale or foreign tokens", async () => {
    const first = `next-${suffix}`;
    const initialToken = `lease-first-${suffix}`;
    await expect(app`select * from public.authorize_account_export_lease(${first}, ${initialToken})`).rejects.toThrow();
    const [privileges] = await migrator<{ can_claim: boolean; can_read: boolean; app_can_claim: boolean }[]>`
      select has_function_privilege('lifecycle_worker', 'public.claim_account_exports(integer,text,integer)', 'EXECUTE') as can_claim,
        has_function_privilege('lifecycle_worker', 'public.authorize_account_export_lease(text,text)', 'EXECUTE') as can_read,
        has_function_privilege('app', 'public.claim_account_exports(integer,text,integer)', 'EXECUTE') as app_can_claim`;
    expect(privileges).toMatchObject({ can_claim: true, can_read: true, app_can_claim: false });
    await expect(app`select * from public.claim_account_exports(1, ${initialToken}, 60)`).rejects.toThrow();
    await expect(worker`select * from public.data_export_requests limit 1`).rejects.toThrow();
    expect(await worker`select * from public.authorize_account_export_lease(${first}, ${initialToken})`).toEqual([]);
    const claims = await worker<{ request_id: string; owner_id: string; lifecycle_generation: string; selection_cutoff_at: Date }[]>`
      select * from public.claim_account_exports(10, ${initialToken}, 60)`;
    expect(claims).toEqual(expect.arrayContaining([
      expect.objectContaining({ request_id: first, owner_id: expiryOwner }),
      expect.objectContaining({ request_id: `generation-new-${suffix}`, owner_id: generationOwner }),
    ]));
    expect((await worker`select * from public.authorize_account_export_lease(${first}, ${initialToken})`)[0])
      .toMatchObject({ owner_id: expiryOwner });
    expect(await worker`select * from public.authorize_account_export_lease(${first}, 'wrong-token')`).toEqual([]);
    await migrator`update public.data_export_requests set lease_expires_at = now() - interval '1 second' where id = ${first}`;
    expect(await worker`select * from public.authorize_account_export_lease(${first}, ${initialToken})`).toEqual([]);
    const renewed = `lease-renewed-${suffix}`;
    expect((await worker`select * from public.claim_account_exports(10, ${renewed}, 60)`).map((entry) => entry.request_id))
      .toContain(first);
    expect(await worker`select * from public.authorize_account_export_lease(${first}, ${initialToken})`).toEqual([]);
    expect((await worker`select * from public.authorize_account_export_lease(${first}, ${renewed})`)[0]?.owner_id)
      .toBe(expiryOwner);
    await migrator`insert into public.account_lifecycles (user_id, generation) values (${expiryOwner}, 1)`;
    expect(await worker`select * from public.authorize_account_export_lease(${first}, ${renewed})`).toEqual([]);
  });
});
