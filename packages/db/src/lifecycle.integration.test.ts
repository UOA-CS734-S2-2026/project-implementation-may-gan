import { readFile } from "node:fs/promises";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { repoPath } from "./migrations/paths";

const migratorUrl = process.env.TEST_LIFECYCLE_DATABASE_URL;
const appUrl = process.env.TEST_LIFECYCLE_APP_DATABASE_URL;
const lifecycleWorkerUrl = process.env.TEST_LIFECYCLE_WORKER_DATABASE_URL;
const enabled = Boolean(migratorUrl && appUrl && lifecycleWorkerUrl);
const testPostgresPort = process.env.VERIFY_POSTGRES_PORT ?? "5433";

function requireLocalTestUrl(value: string | undefined, name: string, user: string): string {
  if (!value) throw new Error(`${name} is required for lifecycle database integration tests.`);
  const url = new URL(value);
  if (url.hostname !== "localhost" || url.port !== testPostgresPort || url.pathname !== "/dayli_lifecycle_test" || url.username !== user) {
    throw new Error(`${name} must target ${user}@localhost:${testPostgresPort}/dayli_lifecycle_test.`);
  }
  return value;
}

(enabled ? describe : describe.skip)("lifecycle schema and least-privilege integration", () => {
  const migratorConnection = requireLocalTestUrl(migratorUrl ?? `postgresql://migrator:migrator@localhost:${testPostgresPort}/dayli_lifecycle_test`, "TEST_LIFECYCLE_DATABASE_URL", "migrator");
  const appConnection = requireLocalTestUrl(appUrl ?? `postgresql://app:app@localhost:${testPostgresPort}/dayli_lifecycle_test`, "TEST_LIFECYCLE_APP_DATABASE_URL", "app");
  const lifecycleWorkerConnection = requireLocalTestUrl(lifecycleWorkerUrl ?? `postgresql://lifecycle_worker:lifecycle_worker@localhost:${testPostgresPort}/dayli_lifecycle_test`, "TEST_LIFECYCLE_WORKER_DATABASE_URL", "lifecycle_worker");
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

  it("does not begin physical purge at the cancellation boundary, only at purge_due_at", async () => {
    const userId = await createUser("purge-due-boundary");
    const reservationId = `purge-due-reservation-${crypto.randomUUID()}`;
    const requestId = `purge-due-request-${crypto.randomUUID()}`;
    await migrator`insert into public.media_reservation
      (id, owner_id, object_key, content_type, byte_size, status, validated_at, expires_at)
      values (${reservationId}, ${userId}, ${`media/${userId}/${reservationId}`}, 'image/jpeg', 1,
        'validated', clock_timestamp(), '2090-01-01T00:00:00Z')`;
    await migrator`with now_value as (select clock_timestamp() as value)
      insert into public.account_lifecycles
        (user_id, state, request_id, idempotency_key_digest, generation, requested_at, cancel_until, purge_due_at)
      select ${userId}, 'pending_deletion', ${requestId}, ${"d".repeat(64)}, 1,
        value - interval '200 hours', value - interval '32 hours', value + interval '136 hours'
      from now_value`;
    const beforeDue = await lifecycleWorker`select * from public.claim_account_purge_cleanup(10, ${`boundary-before-${crypto.randomUUID()}`}, 60)`;
    expect(beforeDue.some((job) => job.owner_id === userId)).toBe(false);
    await migrator`with now_value as (select clock_timestamp() as value)
      update public.account_lifecycles set requested_at = value - interval '337 hours',
        cancel_until = value - interval '169 hours', purge_due_at = value - interval '1 hour'
      from now_value where user_id = ${userId}`;
    const afterDue = await lifecycleWorker`select * from public.claim_account_purge_cleanup(10, ${`boundary-after-${crypto.randomUUID()}`}, 60)`;
    expect(afterDue.some((job) => job.owner_id === userId)).toBe(true);
  });

  it("accepts only JavaScript-safe lifecycle generation values and projects them exactly", async () => {
    const lifecycleUserId = await createUser("generation-lifecycle");
    const exportUserId = await createUser("generation-export");
    const exportId = `export-generation-${crypto.randomUUID()}`;
    const maximumSafeInteger = "9007199254740991";

    await app`
      insert into public.account_lifecycles (user_id, generation)
      values (${lifecycleUserId}, ${maximumSafeInteger}::bigint)
    `;
    await migrator`
      insert into public.data_export_requests (id, user_id, lifecycle_generation)
      values (${exportId}, ${exportUserId}, ${maximumSafeInteger}::bigint)
    `;

    const [lifecycle] = await migrator`
      select generation::text as generation from public.account_lifecycles where user_id = ${lifecycleUserId}
    `;
    const [dataExport] = await migrator`
      select lifecycle_generation::text as generation from public.data_export_requests where id = ${exportId}
    `;
    expect(lifecycle).toEqual({ generation: maximumSafeInteger });
    expect(dataExport).toEqual({ generation: maximumSafeInteger });

    await expect(app.begin((tx) => tx`
      update public.account_lifecycles set generation = 9007199254740992 where user_id = ${lifecycleUserId}
    `)).rejects.toMatchObject({ code: "23514" });
    await expect(migrator.begin((tx) => tx`
      update public.data_export_requests set lifecycle_generation = -1 where id = ${exportId}
    `)).rejects.toMatchObject({ code: "23514" });
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
      await migrator`
        insert into public.data_export_requests (id, user_id, lifecycle_generation, requested_at)
        values (${firstId}, ${userId}, 3, ${requestedAt})
      `;
      await expect(migrator.begin((tx) => tx`
        insert into public.data_export_requests (id, user_id, lifecycle_generation, requested_at)
        values (${secondId}, ${userId}, 3, ${requestedAt})
      `)).rejects.toMatchObject({ code: "23505" });

      await migrator`
        update public.data_export_requests
        set status = 'ready', snapshot_cutoff_at = ${requestedAt}, archive_object_key = 'exports/opaque/archive',
            ready_at = ${readyAt}, expires_at = '2026-03-08T22:00:00.000Z'
        where id = ${firstId}
      `;
      await expect(migrator.begin((tx) => tx`
        update public.data_export_requests
        set expires_at = ready_at + interval '1 day'
        where id = ${firstId}
      `)).rejects.toMatchObject({ code: "23514" });

      await migrator`
        insert into public.data_export_object_cleanup_tasks (id, archive_object_key, next_attempt_at)
        values (${cleanupTaskId}, 'exports/opaque/archive', ${readyAt})
      `;
      await migrator`
        update public.data_export_requests
        set status = 'expired', snapshot_cutoff_at = null, archive_object_key = null,
            ready_at = null, expires_at = null, archive_cleanup_task_id = ${cleanupTaskId}
        where id = ${firstId}
      `;
      await expect(migrator.begin((tx) => tx`
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

  it("keeps every export operations table private after reapplying role bootstrap", async () => {
    const bootstrap = await readFile(repoPath("packages/db/admin/bootstrap-migrator.sql"), "utf8");
    await migrator.unsafe(bootstrap);
    const tables = ["data_export_requests", "data_export_object_cleanup_tasks", "data_export_cleanup_incidents"] as const;
    const privileges = await migrator<{ table_name: string; role_name: string;
      can_select: boolean; can_insert: boolean; can_update: boolean; can_delete: boolean }[]>`
      select table_name, role_name,
        has_table_privilege(role_name, format('public.%I', table_name), 'SELECT') as can_select,
        has_table_privilege(role_name, format('public.%I', table_name), 'INSERT') as can_insert,
        has_table_privilege(role_name, format('public.%I', table_name), 'UPDATE') as can_update,
        has_table_privilege(role_name, format('public.%I', table_name), 'DELETE') as can_delete
      from (values ('data_export_requests'), ('data_export_object_cleanup_tasks'),
        ('data_export_cleanup_incidents')) as tables(table_name)
      cross join (values ('app'), ('lifecycle_worker')) as roles(role_name)
      order by table_name, role_name
    `;
    expect(privileges).toHaveLength(6);
    for (const row of privileges) {
      expect(row).toMatchObject({ can_select: false, can_insert: false, can_update: false, can_delete: false });
    }
    for (const client of [app, lifecycleWorker]) {
      for (const table of tables) {
        await expect(client.unsafe(`select * from public.${table}`)).rejects.toMatchObject({ code: "42501" });
        await expect(client.unsafe(`insert into public.${table} default values`)).rejects.toMatchObject({ code: "42501" });
        await expect(client.unsafe(`update public.${table} set id = id where false`)).rejects.toMatchObject({ code: "42501" });
        await expect(client.unsafe(`delete from public.${table} where false`)).rejects.toMatchObject({ code: "42501" });
      }
    }
  });

  it("reapplies role bootstrap before and after 0025 without restoring inactive proof or grant access", async () => {
    const bootstrap = await readFile(repoPath("packages/db/admin/bootstrap-migrator.sql"), "utf8");
    const rollback = new Error("rollback pre-0025 bootstrap fixture");
    await expect(migrator.begin(async (transaction) => {
      await transaction`drop table public.account_google_reauthentication_intents`;
      await transaction.unsafe(bootstrap);
      const [grants] = await transaction`
        select has_table_privilege('app', 'public.account_management_grants', 'INSERT') as can_insert,
               has_table_privilege('app', 'public.account_management_grants', 'UPDATE') as can_update,
               has_table_privilege('app', 'public.account_management_grants', 'DELETE') as can_delete
      `;
      expect(grants).toEqual({ can_insert: false, can_update: false, can_delete: false });
      throw rollback;
    })).rejects.toBe(rollback);

    await migrator.unsafe(bootstrap);
    const privileges = await migrator`
      select table_name, role_name,
        has_table_privilege(role_name, format('public.%I', table_name), 'SELECT') as can_select,
        has_table_privilege(role_name, format('public.%I', table_name), 'INSERT') as can_insert,
        has_table_privilege(role_name, format('public.%I', table_name), 'UPDATE') as can_update,
        has_table_privilege(role_name, format('public.%I', table_name), 'DELETE') as can_delete
      from (values ('account_google_reauthentication_intents'), ('account_management_grants')) as tables(table_name)
      cross join (values ('app'), ('lifecycle_worker')) as roles(role_name)
      order by table_name, role_name
    `;
    expect(privileges).toEqual([
      { table_name: "account_google_reauthentication_intents", role_name: "app", can_select: false, can_insert: false, can_update: false, can_delete: false },
      { table_name: "account_google_reauthentication_intents", role_name: "lifecycle_worker", can_select: false, can_insert: false, can_update: false, can_delete: false },
      { table_name: "account_management_grants", role_name: "app", can_select: false, can_insert: false, can_update: false, can_delete: false },
      { table_name: "account_management_grants", role_name: "lifecycle_worker", can_select: false, can_insert: false, can_update: false, can_delete: false },
    ]);
    await expect(app`select * from public.account_google_reauthentication_intents`).rejects.toMatchObject({ code: "42501" });
    await expect(app`insert into public.account_management_grants default values`).rejects.toMatchObject({ code: "42501" });
  });

  it("stages two synthetic owners through leased R2 cleanup, retry, and physical completion", async () => {
    const firstOwner = await createUser("purge-first");
    const secondOwner = await createUser("purge-second");
    const firstRequest = `purge-request-${crypto.randomUUID()}`;
    const secondRequest = `purge-request-${crypto.randomUUID()}`;
    const firstReservation = `purge-reservation-${crypto.randomUUID()}`;
    const secondReservation = `purge-reservation-${crypto.randomUUID()}`;
    const requestedAt = "2025-01-01T00:00:00.000Z";

    for (const [owner, request, reservation] of [[firstOwner, firstRequest, firstReservation], [secondOwner, secondRequest, secondReservation]] as const) {
      await migrator`insert into public.media_reservation
        (id, owner_id, object_key, content_type, byte_size, status, validated_at, expires_at)
        values (${reservation}, ${owner}, ${`media/${owner}/${reservation}`}, 'image/jpeg', 1,
          'validated', ${requestedAt}, '2090-01-01T00:00:00Z')`;
      await migrator`insert into public.account_lifecycles
        (user_id, state, request_id, idempotency_key_digest, generation, requested_at, cancel_until, purge_due_at)
        values (${owner}, 'pending_deletion', ${request}, ${"e".repeat(64)}, 2,
          ${requestedAt}, '2025-01-08T00:00:00Z', '2025-01-15T00:00:00Z')`;
    }
    const secondFirstReservation = `purge-reservation-second-${crypto.randomUUID()}`;
    await migrator`insert into public.media_reservation
      (id, owner_id, object_key, content_type, byte_size, status, validated_at, expires_at)
      values (${secondFirstReservation}, ${firstOwner}, ${`media/${firstOwner}/${secondFirstReservation}`}, 'image/jpeg', 1,
        'validated', ${requestedAt}, '2090-01-01T00:00:00Z')`;
    // Exercise the restrictive immutable post history FKs, not merely bare reservations.
    const postId = `purge-post-${crypto.randomUUID()}`;
    const mediaId = `purge-media-${crypto.randomUUID()}`;
    await migrator`insert into public.posts
      (id, author_id, local_date, prompt_id, reflective_answer, rating, audience, accepted_at, released_at)
      values (${postId}, ${firstOwner}, '2026-09-22', 'prompt-01-01', 'A valid reflection', 8,
        'friends', '2026-09-22T10:00:00+12:00', '2026-09-22T10:00:01+12:00')`;
    await migrator`insert into public.post_media (id, post_id, reservation_id, attachment_order)
      values (${mediaId}, ${postId}, ${firstReservation}, 0)`;
    await migrator`insert into public.post_revisions
      (id, post_id, revision_number, previous_reflective_answer, previous_rating, previous_audience, previous_prompt_id, previous_attachment_refs)
      values (${`purge-revision-${crypto.randomUUID()}`}, ${postId}, 1, 'Prior reflection', 8, 'friends', 'prompt-01-01',
        ${migrator.json([{ media_id: mediaId, attachment_order: 0, status: "attached" }])})`;
    await migrator`insert into public.tomorrow_notes (id, post_id, author_id, note, available_on)
      values (${`purge-note-${crypto.randomUUID()}`}, ${postId}, ${firstOwner}, 'Read this tomorrow', '2026-09-23')`;
    await expect(app`select * from public.account_purge_object_cleanup_tasks`).rejects.toMatchObject({ code: "42501" });
    await expect(lifecycleWorker`delete from public."user" where id = ${firstOwner}`).rejects.toMatchObject({ code: "42501" });

    const firstLease = `purge-lease-${crypto.randomUUID()}`;
    const claimed = await lifecycleWorker`select * from public.claim_account_purge_cleanup(10, ${firstLease}, 60)`;
    expect(claimed).toHaveLength(2);
    const firstJob = claimed.find((job) => job.owner_id === firstOwner)!;
    const secondJob = claimed.find((job) => job.owner_id === secondOwner)!;
    expect([`media/${firstOwner}/${firstReservation}`, `media/${firstOwner}/${secondFirstReservation}`]).toContain(firstJob.object_key);
    expect(secondJob.object_key).toBe(`media/${secondOwner}/${secondReservation}`);

    // This is the database half of an R2 failure. The worker unit test injects
    // the failing R2 adapter and proves it calls this fenced retry instead of completion.
    expect(await lifecycleWorker`select public.retry_account_purge_cleanup(${firstJob.task_id}, 2, ${firstLease}, 30) as accepted`)
      .toEqual([{ accepted: true }]);
    const [failed] = await migrator`select state, last_error_category from public.account_lifecycles where user_id = ${firstOwner}`;
    expect(failed).toEqual({ state: "purge_failed", last_error_category: "storage" });
    await migrator`update public.account_lifecycles set next_attempt_at = clock_timestamp() - interval '1 second' where user_id = ${firstOwner}`;
    await migrator`update public.account_purge_object_cleanup_tasks set next_attempt_at = clock_timestamp() - interval '1 second' where user_id = ${firstOwner}`;

    const retryLease = `purge-retry-${crypto.randomUUID()}`;
    const [retried] = await lifecycleWorker`select * from public.claim_account_purge_cleanup(1, ${retryLease}, 60)`;
    expect(retried.owner_id).toBe(firstOwner);
    expect(await lifecycleWorker`select public.complete_account_purge_cleanup(${retried.task_id}, 2, ${retryLease}) as completed`)
      .toEqual([{ completed: true }]);
    // Completing a non-final object is accepted and fenced correctly. It must
    // not misreport a completed R2 deletion merely because finalization waits.
    const [firstStillPresent] = await migrator`select exists(select 1 from public."user" where id = ${firstOwner}) as present`;
    expect(firstStillPresent?.present).toBe(true);
    const finalLease = `purge-final-${crypto.randomUUID()}`;
    const [finalJob] = await lifecycleWorker`select * from public.claim_account_purge_cleanup(1, ${finalLease}, 60)`;
    expect(finalJob.owner_id).toBe(firstOwner);
    expect(await lifecycleWorker`select public.complete_account_purge_cleanup(${finalJob.task_id}, 2, ${finalLease}) as completed`)
      .toEqual([{ completed: true }]);
    const [firstGone] = await migrator`select exists(select 1 from public."user" where id = ${firstOwner}) as present`;
    const [secondPresent] = await migrator`select exists(select 1 from public."user" where id = ${secondOwner}) as present`;
    const [postGone] = await migrator`select exists(select 1 from public.posts where id = ${postId}) as present`;
    const [receipt] = await migrator`select request_id, completed_stage_count from public.account_purge_receipts where request_id = ${firstRequest}`;
    expect(firstGone?.present).toBe(false);
    expect(secondPresent?.present).toBe(true);
    expect(postGone?.present).toBe(false);
    expect(receipt).toEqual({ request_id: firstRequest, completed_stage_count: 7 });
  });

  it("retains export cleanup metadata after account finalization for late multipart recovery", async () => {
    const owner = await createUser("purge-export-recovery");
    const requestId = `purge-export-request-${crypto.randomUUID()}`;
    const taskId = `purge-export-task-${crypto.randomUUID()}`;
    exportCleanupTasks.push(taskId);
    await migrator`insert into public.data_export_requests (id, user_id, lifecycle_generation)
      values (${requestId}, ${owner}, 1)`;
    await migrator`insert into public.data_export_object_cleanup_tasks
      (id, archive_object_key, status, next_attempt_at)
      values (${taskId}, 'private/data-exports/v2/' || encode(sha256(convert_to(${requestId}, 'UTF8')), 'hex') || '/' || repeat('a', 64) || '.zip',
        'pending', clock_timestamp())`;
    await migrator`insert into public.account_lifecycles
      (user_id, state, request_id, idempotency_key_digest, generation, requested_at, cancel_until, purge_due_at)
      values (${owner}, 'pending_deletion', ${`purge-export-lifecycle-${crypto.randomUUID()}`}, ${"b".repeat(64)}, 1,
        '2025-01-01T00:00:00.000Z', '2025-01-08T00:00:00.000Z', '2025-01-15T00:00:00.000Z')`;
    const lease = `purge-export-lease-${crypto.randomUUID()}`;
    const [job] = await lifecycleWorker`select * from public.claim_account_purge_cleanup(1, ${lease}, 60)`;
    expect(job.export_cleanup_task_id).toBe(taskId);
    expect(await lifecycleWorker`select public.complete_account_purge_cleanup(${job.task_id}, 1, ${lease}) as completed`)
      .toEqual([{ completed: true }]);
    const [ownerPresent] = await migrator`select exists(select 1 from public."user" where id = ${owner}) as present`;
    const [recoveryTask] = await migrator`select status, verified_absent_at is null as unreconciled
      from public.data_export_object_cleanup_tasks where id = ${taskId}`;
    expect(ownerPresent?.present).toBe(false);
    expect(recoveryTask).toEqual({ status: "pending", unreconciled: true });
  });

  it("serializes concurrent finalization of both direct-message participants", async () => {
    const firstOwner = await createUser("purge-conversation-first");
    const secondOwner = await createUser("purge-conversation-second");
    const [lowOwner, highOwner] = [firstOwner, secondOwner].sort();
    const conversationId = `purge-conversation-${crypto.randomUUID()}`;
    const messageId = `purge-message-${crypto.randomUUID()}`;
    const requestedAt = "2025-01-01T00:00:00.000Z";
    for (const owner of [firstOwner, secondOwner]) {
      const reservationId = `purge-conversation-reservation-${crypto.randomUUID()}`;
      await migrator`insert into public.media_reservation
        (id, owner_id, object_key, content_type, byte_size, status, validated_at, expires_at)
        values (${reservationId}, ${owner}, ${`media/${owner}/${reservationId}`}, 'image/jpeg', 1,
          'validated', ${requestedAt}, '2090-01-01T00:00:00Z')`;
      await migrator`insert into public.account_lifecycles
        (user_id, state, request_id, idempotency_key_digest, generation, requested_at, cancel_until, purge_due_at)
        values (${owner}, 'pending_deletion', ${`purge-conversation-request-${crypto.randomUUID()}`}, ${"c".repeat(64)}, 1,
          ${requestedAt}, '2025-01-08T00:00:00Z', '2025-01-15T00:00:00Z')`;
    }
    await migrator`insert into public.conversations
      (id, kind, user_low_id, user_high_id, initiator_id, request_state, last_message_sequence, last_change_sequence, last_activity_at, created_at, updated_at)
      values (${conversationId}, 'direct', ${lowOwner}, ${highOwner}, ${lowOwner}, 'active', 1, 1,
        clock_timestamp(), clock_timestamp(), clock_timestamp())`;
    for (const owner of [lowOwner, highOwner]) {
      await migrator`insert into public.conversation_members
        (conversation_id, user_id, participant_id, last_read_sequence, receipt_sequence, created_at, updated_at)
        values (${conversationId}, ${owner}, ${owner}, 0, 0, clock_timestamp(), clock_timestamp())`;
    }
    await migrator`insert into public.messages
      (id, conversation_id, sequence, sender_id, sender_participant_id, client_message_id, request_fingerprint, body, created_at)
      values (${messageId}, ${conversationId}, 1, ${lowOwner}, ${lowOwner}, ${`purge-message-client-${crypto.randomUUID()}`},
        ${"a".repeat(64)}, 'Retained until both participants are gone', clock_timestamp())`;

    const lease = `purge-conversation-lease-${crypto.randomUUID()}`;
    const claimed = await lifecycleWorker`select * from public.claim_account_purge_cleanup(10, ${lease}, 60)`;
    const firstJob = claimed.find((job) => job.owner_id === firstOwner)!;
    const secondJob = claimed.find((job) => job.owner_id === secondOwner)!;
    const secondWorker = postgres(lifecycleWorkerConnection, { max: 1, prepare: false, onnotice: () => undefined });
    try {
      const [firstCompletion, secondCompletion] = await Promise.all([
        lifecycleWorker`select public.complete_account_purge_cleanup(${firstJob.task_id}, 1, ${lease}) as completed`,
        secondWorker`select public.complete_account_purge_cleanup(${secondJob.task_id}, 1, ${lease}) as completed`,
      ]);
      expect(firstCompletion).toEqual([{ completed: true }]);
      expect(secondCompletion).toEqual([{ completed: true }]);
    } finally {
      await secondWorker.end({ timeout: 5 });
    }
    const [conversationPresent] = await migrator`select exists(select 1 from public.conversations where id = ${conversationId}) as present`;
    const [messagePresent] = await migrator`select exists(select 1 from public.messages where id = ${messageId}) as present`;
    expect(conversationPresent?.present).toBe(false);
    expect(messagePresent?.present).toBe(false);
  });

  it("removes expired content-free purge receipts through the bounded worker procedure", async () => {
    const requestId = `expired-purge-receipt-${crypto.randomUUID()}`;
    receipts.push(requestId);
    await migrator`insert into public.account_purge_receipts
      (request_id, subject_digest, requested_at, completed_at, expires_at, completed_stage_count)
      values (${requestId}, ${"f".repeat(64)}, clock_timestamp() - interval '11000 hours',
        clock_timestamp() - interval '10000 hours', clock_timestamp() - interval '9280 hours', 7)`;
    await expect(app`select public.delete_expired_account_purge_receipts(1)`).rejects.toMatchObject({ code: "42501" });
    expect(await lifecycleWorker`select public.delete_expired_account_purge_receipts(1) as deleted`)
      .toEqual([{ deleted: 1 }]);
    const [present] = await migrator`select exists(select 1 from public.account_purge_receipts where request_id = ${requestId}) as present`;
    expect(present?.present).toBe(false);
  });

  it("denies app and lifecycle_worker direct physical purge access", async () => {
    const userId = await createUser("privileges");

    await expect(app`delete from public."user" where id = ${userId}`).rejects.toMatchObject({ code: "42501" });
    await expect(lifecycleWorker`select * from public.account_lifecycles`).rejects.toMatchObject({ code: "42501" });
    await expect(lifecycleWorker`delete from public."user" where id = ${userId}`).rejects.toMatchObject({ code: "42501" });
    await expect(app`select * from public.operator_cases`).rejects.toMatchObject({ code: "42501" });
  });
});
