import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import postgres from "postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { seedPastDeadline } from "../scripts/staging-trash-lifecycle-proof";
// @ts-expect-error The staging preflight is a directly executed ESM script.
import { inspectEligiblePostTrash } from "../../../scripts/verify-staging-post-trash-activation.mjs";
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
  const proofPosts: string[] = [];
  const proofReservations: string[] = [];
  let activationMarkerDigest = "";
  let activationPostId = "";

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

  beforeEach(async () => {
    await migrator`select public.set_account_purge_operator_pause(false,
      clock_timestamp() + interval '15 minutes', 'isolated integration test', 'vitest')`;
  });

  afterAll(async () => {
    try {
      if (receipts.length > 0) await migrator`delete from public.account_purge_receipts where request_id = any(${receipts})`;
      if (legalVersions.length > 0) {
        await migrator`delete from public.terms_acceptances where terms_version_id = any(${legalVersions})`;
        await migrator`delete from public.registration_intents where terms_version_id = any(${legalVersions})`;
      }
      if (proofPosts.length > 0) {
        await migrator`delete from public.post_media where post_id = any(${proofPosts})`;
        await migrator`delete from public.posts where id = any(${proofPosts})`;
      }
      if (proofReservations.length > 0) await migrator`delete from public.media_reservation where id = any(${proofReservations})`;
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
    const beforeDue = await migrator`select * from public.claim_account_purge_cleanup(10, ${`boundary-before-${crypto.randomUUID()}`}, 60)`;
    expect(beforeDue.some((job) => job.owner_id === userId)).toBe(false);
    await migrator`with now_value as (select clock_timestamp() as value)
      update public.account_lifecycles set requested_at = value - interval '337 hours',
        cancel_until = value - interval '169 hours', purge_due_at = value - interval '1 hour'
      from now_value where user_id = ${userId}`;
    const afterDue = await migrator`select * from public.claim_account_purge_cleanup(10, ${`boundary-after-${crypto.randomUUID()}`}, 60)`;
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
    const tables = ["data_export_requests", "data_export_object_cleanup_tasks", "data_export_cleanup_incidents",
      "account_purge_operator_control"] as const;
    const privileges = await migrator<{ table_name: string; role_name: string;
      can_select: boolean; can_insert: boolean; can_update: boolean; can_delete: boolean }[]>`
      select table_name, role_name,
        has_table_privilege(role_name, format('public.%I', table_name), 'SELECT') as can_select,
        has_table_privilege(role_name, format('public.%I', table_name), 'INSERT') as can_insert,
        has_table_privilege(role_name, format('public.%I', table_name), 'UPDATE') as can_update,
        has_table_privilege(role_name, format('public.%I', table_name), 'DELETE') as can_delete
      from (values ('data_export_requests'), ('data_export_object_cleanup_tasks'),
        ('data_export_cleanup_incidents'), ('account_purge_operator_control')) as tables(table_name)
      cross join (values ('app'), ('lifecycle_worker')) as roles(role_name)
      order by table_name, role_name
    `;
    expect(privileges).toHaveLength(8);
    for (const row of privileges) {
      expect(row).toMatchObject({ can_select: false, can_insert: false, can_update: false, can_delete: false });
    }
    for (const client of [app, lifecycleWorker]) {
      for (const table of tables) {
        await expect(client.unsafe(`select * from public.${table}`)).rejects.toMatchObject({ code: "42501" });
        await expect(client.unsafe(`insert into public.${table} default values`)).rejects.toMatchObject({ code: "42501" });
        const identityColumn = table === "account_purge_operator_control" ? "singleton" : "id";
        await expect(client.unsafe(`update public.${table} set ${identityColumn} = ${identityColumn} where false`))
          .rejects.toMatchObject({ code: "42501" });
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

  it("seeds only an exact freshly trashed synthetic proof fixture past its cleanup deadline", async () => {
    const marker = `staging-trash-proof-${crypto.randomUUID().replaceAll("-", "")}`;
    activationMarkerDigest = createHash("sha256").update(marker).digest("hex");
    const ownerId = `trash-proof-owner-${crypto.randomUUID()}`;
    const sessionId = `trash-proof-session-${crypto.randomUUID()}`;
    const postId = `trash-proof-post-${crypto.randomUUID()}`;
    activationPostId = postId;
    const reservationId = `trash-proof-reservation-${crypto.randomUUID()}`;
    const mediaId = `trash-proof-media-${crypto.randomUUID()}`;
    users.push(ownerId);
    proofPosts.push(postId);
    proofReservations.push(reservationId);
    await migrator`insert into public."user" (id, name, email)
      values (${ownerId}, ${`${marker}-2`}, ${`${marker}-2@synthetic.invalid`})`;
    await migrator`insert into public.session (id, token, user_id, expires_at)
      values (${sessionId}, ${`trash-proof-token-${crypto.randomUUID()}`}, ${ownerId}, clock_timestamp() + interval '10 minutes')`;
    await migrator`insert into public.media_reservation
      (id, owner_id, object_key, content_type, byte_size, status, validated_at, expires_at)
      values (${reservationId}, ${ownerId}, ${`media/${ownerId}/${reservationId}`}, 'image/jpeg', 12,
        'validated', clock_timestamp(), clock_timestamp() + interval '10 minutes')`;
    await migrator`insert into public.posts
      (id, author_id, local_date, prompt_id, reflective_answer, rating, audience, accepted_at, released_at)
      values (${postId}, ${ownerId}, current_date, 'prompt-01-01', ${`${marker}:2`}, 5,
        'solo', clock_timestamp() - interval '1 second', clock_timestamp())`;
    await migrator`insert into public.post_media (id, post_id, reservation_id, attachment_order)
      values (${mediaId}, ${postId}, ${reservationId}, 0)`;

    const [trashed] = await app`select * from public.move_post_to_trash(${ownerId}, ${sessionId}, ${postId})`;
    expect(trashed?.outcome).toBe("trashed");
    const generation = Number(trashed?.generation);
    const fixture = { ownerId, postId, mediaId, reservationId, generation,
      objectKey: `media/${ownerId}/${reservationId}`, marker };
    const anotherMarker = `staging-trash-proof-${crypto.randomUUID().replaceAll("-", "")}`;
    await expect(migrator.begin((tx) => seedPastDeadline(tx, { ...fixture, marker: anotherMarker })))
      .rejects.toThrow("Synthetic owner guard failed.");
    await expect(migrator.begin((tx) => seedPastDeadline(tx, { ...fixture, generation: generation + 1 })))
      .rejects.toThrow("Synthetic post guard failed.");
    await expect(migrator.begin((tx) => seedPastDeadline(tx, {
      ...fixture, reservationId: `missing-${crypto.randomUUID()}`,
    }))).rejects.toThrow("Synthetic reservation guard failed.");
    const [stillFresh] = await migrator`select restore_until > clock_timestamp() as restorable,
      trash_purge_due_at > clock_timestamp() as purge_in_future from public.posts where id = ${postId}`;
    expect(stillFresh).toEqual({ restorable: true, purge_in_future: true });

    const objectKey = await migrator.begin((tx) => seedPastDeadline(tx, fixture));
    expect(objectKey).toBe(`media/${ownerId}/${reservationId}`);
    const [seeded] = await migrator`select
      trashed_at < clock_timestamp() - interval '336 hours' as past_deadline,
      restore_until = trashed_at + interval '168 hours' as restore_exact,
      trash_purge_due_at = trashed_at + interval '336 hours' as purge_exact,
      trash_lease_token is null as lease_clear, trash_failure_category is null as failure_clear
      from public.posts where id = ${postId}`;
    expect(seeded).toEqual({ past_deadline: true, restore_exact: true, purge_exact: true, lease_clear: true, failure_clear: true });
  });

  it("admits only the approved eligible synthetic fixture without changing cleanup state", async () => {
    const [before] = await migrator`select updated_at, trash_lease_token, trash_lease_expires_at
      from public.posts where id = ${activationPostId}`;
    await expect(inspectEligiblePostTrash(migrator, activationMarkerDigest))
      .resolves.toEqual({ eligible: 1, approved: 1, unknown: 0 });
    await expect(inspectEligiblePostTrash(migrator, ""))
      .resolves.toEqual({ eligible: 1, approved: 0, unknown: 1 });
    const [after] = await migrator`select updated_at, trash_lease_token, trash_lease_expires_at
      from public.posts where id = ${activationPostId}`;
    expect(after).toEqual(before);

    const ordinaryOwner = await createUser("eligible-ordinary");
    const ordinaryPost = `eligible-ordinary-${crypto.randomUUID()}`;
    proofPosts.push(ordinaryPost);
    await migrator`with deadline as (select clock_timestamp() - interval '337 hours' as trashed_at)
      insert into public.posts
        (id, author_id, local_date, prompt_id, reflective_answer, rating, audience, accepted_at, released_at,
          trashed_at, restore_until, trash_purge_due_at, trash_generation)
      select ${ordinaryPost}, ${ordinaryOwner}, current_date, 'prompt-01-01', 'Ordinary eligible content', 5, 'solo',
        clock_timestamp() - interval '2 seconds', clock_timestamp() - interval '1 second', deadline.trashed_at,
        deadline.trashed_at + interval '168 hours', deadline.trashed_at + interval '336 hours', 1 from deadline`;
    await expect(inspectEligiblePostTrash(migrator, activationMarkerDigest))
      .resolves.toEqual({ eligible: 2, approved: 1, unknown: 1 });
    await migrator`update public.posts set trash_failure_category = 'shared_media',
      trash_next_attempt_at = 'infinity'::timestamptz where id = ${ordinaryPost}`;
    await expect(inspectEligiblePostTrash(migrator, activationMarkerDigest))
      .resolves.toEqual({ eligible: 1, approved: 1, unknown: 0 });
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
    const claimed = await migrator`select * from public.claim_account_purge_cleanup(10, ${firstLease}, 60)`;
    expect(claimed).toHaveLength(2);
    const firstJob = claimed.find((job) => job.owner_id === firstOwner)!;
    const secondJob = claimed.find((job) => job.owner_id === secondOwner)!;
    expect([`media/${firstOwner}/${firstReservation}`, `media/${firstOwner}/${secondFirstReservation}`]).toContain(firstJob.object_key);
    expect(secondJob.object_key).toBe(`media/${secondOwner}/${secondReservation}`);

    // This is the database half of an R2 failure. The worker unit test injects
    // the failing R2 adapter and proves it calls this fenced retry instead of completion.
    expect(await migrator`select public.retry_account_purge_cleanup(${firstJob.task_id}, 2, ${firstLease}, 30) as accepted`)
      .toEqual([{ accepted: true }]);
    const [failed] = await migrator`select state, last_error_category from public.account_lifecycles where user_id = ${firstOwner}`;
    expect(failed).toEqual({ state: "purge_failed", last_error_category: "storage" });
    await migrator`update public.account_lifecycles set next_attempt_at = clock_timestamp() - interval '1 second' where user_id = ${firstOwner}`;
    await migrator`update public.account_purge_object_cleanup_tasks set next_attempt_at = clock_timestamp() - interval '1 second' where user_id = ${firstOwner}`;

    const retryLease = `purge-retry-${crypto.randomUUID()}`;
    const [retried] = await migrator`select * from public.claim_account_purge_cleanup(1, ${retryLease}, 60)`;
    expect(retried.owner_id).toBe(firstOwner);
    expect(await migrator`select public.complete_account_purge_cleanup(${retried.task_id}, 2, ${retryLease}) as completed`)
      .toEqual([{ completed: true }]);
    // Completing a non-final object is accepted and fenced correctly. It must
    // not misreport a completed R2 deletion merely because finalization waits.
    const [firstStillPresent] = await migrator`select exists(select 1 from public."user" where id = ${firstOwner}) as present`;
    expect(firstStillPresent?.present).toBe(true);
    const finalLease = `purge-final-${crypto.randomUUID()}`;
    const [finalJob] = await migrator`select * from public.claim_account_purge_cleanup(1, ${finalLease}, 60)`;
    expect(finalJob.owner_id).toBe(firstOwner);
    expect(await migrator`select public.complete_account_purge_cleanup(${finalJob.task_id}, 2, ${finalLease}) as completed`)
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

  it("fences a leased purge on pause and recovers it only after an explicit short resume", async () => {
    const owner = await createUser("purge-operator-pause");
    const reservation = `purge-operator-reservation-${crypto.randomUUID()}`;
    await migrator`insert into public.media_reservation
      (id, owner_id, object_key, content_type, byte_size, status, validated_at, expires_at)
      values (${reservation}, ${owner}, ${`media/${owner}/${reservation}`}, 'image/jpeg', 1,
        'validated', clock_timestamp(), '2090-01-01T00:00:00Z')`;
    await migrator`insert into public.account_lifecycles
      (user_id, state, request_id, idempotency_key_digest, generation, requested_at, cancel_until, purge_due_at)
      values (${owner}, 'pending_deletion', ${crypto.randomUUID()}, ${"9".repeat(64)}, 1,
        '2025-01-01T00:00:00Z', '2025-01-08T00:00:00Z', '2025-01-15T00:00:00Z')`;

    const firstLease = `operator-lease-${crypto.randomUUID()}`;
    const [job] = await migrator`select * from public.claim_account_purge_cleanup(1, ${firstLease}, 60)`;
    expect(job.owner_id).toBe(owner);
    expect(await migrator`select public.authorize_account_purge_cleanup(
      ${job.task_id}, 1, ${firstLease}) as authorized`).toEqual([{ authorized: true }]);
    expect(await migrator`select public.set_account_purge_operator_pause(
      true, null, 'incident pause', 'integration operator') as paused`).toEqual([{ paused: true }]);
    expect(await migrator`select public.authorize_account_purge_cleanup(
      ${job.task_id}, 1, ${firstLease}) as authorized`).toEqual([{ authorized: false }]);
    expect(await migrator`select public.complete_account_purge_cleanup(
      ${job.task_id}, 1, ${firstLease}) as completed`).toEqual([{ completed: false }]);
    expect(await migrator`select * from public.claim_account_purge_cleanup(
      1, ${crypto.randomUUID()}, 60)`).toEqual([]);

    await migrator`select public.set_account_purge_operator_pause(false,
      clock_timestamp() + interval '5 minutes', 'reviewed recovery', 'integration operator')`;
    const recoveryLease = `operator-recovery-${crypto.randomUUID()}`;
    const [recovered] = await migrator`select * from public.claim_account_purge_cleanup(1, ${recoveryLease}, 60)`;
    expect(recovered.owner_id).toBe(owner);
    await migrator`update public.account_purge_object_cleanup_tasks set attempt_count = 8
      where id = ${recovered.task_id}`;
    expect(await migrator`select public.retry_account_purge_cleanup(
      ${recovered.task_id}, 1, ${recoveryLease}, 30) as accepted`).toEqual([{ accepted: true }]);
    const [aggregate] = await lifecycleWorker`select * from public.report_account_purge_cleanup()`;
    const [operatorReport] = await lifecycleWorker`select * from public.report_account_purge_operator_control()`;
    expect(Number(aggregate.terminal_failed_count)).toBeGreaterThanOrEqual(1);
    expect(Number(operatorReport.terminal_cleanup_count)).toBeGreaterThanOrEqual(1);
  });

  it("serializes provider admission and pause in both lock orderings", async () => {
    const owner = await createUser("permit-interleaving");
    const reservation = `permit-interleaving-reservation-${crypto.randomUUID()}`;
    await migrator`insert into public.media_reservation
      (id, owner_id, object_key, content_type, byte_size, status, validated_at, expires_at)
      values (${reservation}, ${owner}, ${`media/${owner}/${reservation}`}, 'image/jpeg', 1,
        'validated', clock_timestamp(), '2090-01-01T00:00:00Z')`;
    await migrator`insert into public.account_lifecycles
      (user_id, state, request_id, idempotency_key_digest, generation, requested_at, cancel_until, purge_due_at)
      values (${owner}, 'pending_deletion', ${crypto.randomUUID()}, ${"6".repeat(64)}, 5,
        '2025-01-01T00:00:00Z', '2025-01-08T00:00:00Z', '2025-01-15T00:00:00Z')`;
    const firstLease = `interleave-first-${crypto.randomUUID()}`;
    const firstClaims = await migrator`select * from public.claim_account_purge_cleanup(10, ${firstLease}, 90)`;
    const firstJob = firstClaims.find((job) => job.owner_id === owner)!;
    expect(firstJob).toBeTruthy();
    const firstPermit = `interleave-permit-${crypto.randomUUID()}`;
    const secondWorker = postgres(migratorConnection, { max: 1, prepare: false, onnotice: () => undefined });
    const observer = postgres(migratorConnection, { max: 1, prepare: false, onnotice: () => undefined });
    const waitForControlLock = async (blockerPid: number, functionName: string): Promise<void> => {
      const deadline = Date.now() + 2_000;
      while (Date.now() < deadline) {
        const [activity] = await observer<{ pid: number; wait_event_type: string | null; blockers: number[] }[]>`
          select pid, wait_event_type, pg_blocking_pids(pid) as blockers
          from pg_stat_activity
          where state = 'active' and query like ${`%${functionName}%`}
          order by backend_start desc limit 1
        `;
        if (activity?.wait_event_type === "Lock" && activity.blockers.includes(blockerPid)) return;
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      throw new Error(`${functionName} did not wait on control lock held by ${blockerPid}.`);
    };
    const settleWithin = async <T>(promise: Promise<T>, label: string): Promise<T> => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        return await Promise.race([promise, new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new Error(`${label} did not settle after lock release.`)), 2_000);
        })]);
      } finally {
        if (timer) clearTimeout(timer);
      }
    };
    let pausePromise: Promise<unknown> | undefined;
    let startPromise: Promise<unknown> | undefined;
    try {
      await migrator.begin(async (transaction) => {
        const [{ pid: holderPid }] = await transaction<{ pid: number }[]>`select pg_backend_pid() as pid`;
        expect(await transaction`select * from public.start_account_purge_provider_operation(
          ${firstPermit}, ${firstJob.task_id}, 5, ${firstLease}, 'delete_object',
          clock_timestamp() + interval '30 seconds')`).toHaveLength(1);
        const [{ generation: epoch }] = await transaction`select generation from public.account_purge_operator_control`;
        pausePromise = Promise.resolve(secondWorker`select public.begin_account_purge_provider_pause(
          ${epoch}, 'admission first', 'integration operator') as state`);
        await waitForControlLock(holderPid, "begin_account_purge_provider_pause");
      });
      await expect(settleWithin(pausePromise!, "blocked pause")).resolves.toEqual([{ state: "draining" }]);
      pausePromise = undefined;
      expect(await migrator`select public.finish_account_purge_provider_operation(
        ${firstPermit}, ${firstJob.task_id}, 5, ${firstLease}, true) as accepted`).toEqual([{ accepted: true }]);
      expect(await migrator`select public.refresh_account_purge_provider_drain() as state`).toEqual([{ state: "paused" }]);
      const [{ generation: pausedEpoch }] = await migrator`select generation from public.account_purge_operator_control`;
      expect(await migrator`select public.resume_account_purge_provider_operations(${pausedEpoch},
        clock_timestamp() + interval '5 minutes', 'between orderings', 'integration operator') as resumed`)
        .toEqual([{ resumed: true }]);

      const secondLease = `interleave-second-${crypto.randomUUID()}`;
      const secondClaims = await migrator`select * from public.claim_account_purge_cleanup(10, ${secondLease}, 90)`;
      const secondJob = secondClaims.find((job) => job.owner_id === owner)!;
      expect(secondJob).toBeTruthy();
      await migrator.begin(async (transaction) => {
        const [{ pid: holderPid }] = await transaction<{ pid: number }[]>`select pg_backend_pid() as pid`;
        const [{ generation: epoch }] = await transaction`select generation from public.account_purge_operator_control`;
        expect(await transaction`select public.begin_account_purge_provider_pause(
          ${epoch}, 'pause first', 'integration operator') as state`).toEqual([{ state: "draining" }]);
        startPromise = Promise.resolve(secondWorker`select * from public.start_account_purge_provider_operation(
          ${`blocked-${crypto.randomUUID()}`}, ${secondJob.task_id}, 5, ${secondLease}, 'delete_object',
          clock_timestamp() + interval '30 seconds')`);
        await waitForControlLock(holderPid, "start_account_purge_provider_operation");
      });
      await expect(settleWithin(startPromise!, "blocked admission")).resolves.toEqual([]);
      startPromise = undefined;
      expect(await migrator`select public.refresh_account_purge_provider_drain() as state`).toEqual([{ state: "paused" }]);
      await migrator`update public.account_purge_object_cleanup_tasks
        set next_attempt_at = 'infinity'::timestamptz where id = ${secondJob.task_id}`;
    } finally {
      if (pausePromise) await settleWithin(pausePromise.catch(() => undefined), "pause cleanup").catch(() => undefined);
      if (startPromise) await settleWithin(startPromise.catch(() => undefined), "admission cleanup").catch(() => undefined);
      await observer.end({ timeout: 5 });
      await secondWorker.end({ timeout: 5 });
    }
  });

  it("drains generation-bound provider permits and makes late completion an incident", async () => {
    const owners = [await createUser("permit-first"), await createUser("permit-second")];
    for (const owner of owners) {
      const reservation = `permit-reservation-${crypto.randomUUID()}`;
      await migrator`insert into public.media_reservation
        (id, owner_id, object_key, content_type, byte_size, status, validated_at, expires_at)
        values (${reservation}, ${owner}, ${`media/${owner}/${reservation}`}, 'image/jpeg', 1,
          'validated', clock_timestamp(), '2090-01-01T00:00:00Z')`;
      await migrator`insert into public.account_lifecycles
        (user_id, state, request_id, idempotency_key_digest, generation, requested_at, cancel_until, purge_due_at)
        values (${owner}, 'pending_deletion', ${crypto.randomUUID()}, ${"7".repeat(64)}, 3,
          '2025-01-01T00:00:00Z', '2025-01-08T00:00:00Z', '2025-01-15T00:00:00Z')`;
    }

    const lease = `permit-lease-${crypto.randomUUID()}`;
    const claimedJobs = await migrator`select * from public.claim_account_purge_cleanup(10, ${lease}, 90)`;
    const jobs = owners.map((owner) => claimedJobs.find((job) => job.owner_id === owner)!);
    expect(jobs.every(Boolean)).toBe(true);
    const permits = jobs.map(() => `provider-permit-${crypto.randomUUID()}`);
    const secondWorker = postgres(migratorConnection, { max: 1, prepare: false, onnotice: () => undefined });
    try {
      const starts = await Promise.all([
        migrator`select * from public.start_account_purge_provider_operation(
          ${permits[0]}, ${jobs[0].task_id}, 3, ${lease}, 'delete_object', clock_timestamp() + interval '30 seconds')`,
        secondWorker`select * from public.start_account_purge_provider_operation(
          ${permits[1]}, ${jobs[1].task_id}, 3, ${lease}, 'abort_export_multipart', clock_timestamp() + interval '30 seconds')`,
      ]);
      expect(starts[0]).toHaveLength(1);
      expect(starts[1]).toHaveLength(1);

      const [{ generation: epoch }] = await migrator`select generation from public.account_purge_operator_control`;
      expect(await migrator`select public.begin_account_purge_provider_pause(
        ${epoch}, 'race test pause', 'integration operator') as state`).toEqual([{ state: "draining" }]);

      // The provider may receive a request after the pause transaction commits,
      // but its already-started permit keeps the drain explicitly incomplete.
      expect(await migrator`select * from public.start_account_purge_provider_operation(
        ${`post-pause-${crypto.randomUUID()}`}, ${jobs[0].task_id}, 3, ${lease}, 'delete_object',
        clock_timestamp() + interval '30 seconds')`).toEqual([]);
      const [draining] = await lifecycleWorker`select * from public.report_account_purge_operator_control()`;
      expect(draining).toMatchObject({ drain_state: "draining", safe_to_resume: false,
        external_provider_quiescence_claimed: false });
      expect(Number(draining.started_operation_count)).toBe(2);

      await migrator`update public.account_purge_provider_operation_permits
        set operation_deadline = clock_timestamp() - interval '1 second' where id in (${permits[0]}, ${permits[1]})`;
      expect(await migrator`select public.finish_account_purge_provider_operation(
        ${permits[0]}, ${jobs[0].task_id}, 3, ${lease}, true) as accepted`).toEqual([{ accepted: false }]);
      expect(await secondWorker`select public.finish_account_purge_provider_operation(
        ${permits[1]}, ${jobs[1].task_id}, 3, ${lease}, true) as accepted`).toEqual([{ accepted: false }]);
      expect(await migrator`select public.refresh_account_purge_provider_drain() as state`)
        .toEqual([{ state: "incident" }]);

      const [{ generation: incidentEpoch }] = await migrator`select generation from public.account_purge_operator_control`;
      expect(await migrator`select public.resume_account_purge_provider_operations(
        ${incidentEpoch}, clock_timestamp() + interval '5 minutes', 'unsafe resume', 'integration operator') as resumed`)
        .toEqual([{ resumed: false }]);
      expect(await migrator`select public.reconcile_account_purge_provider_operation(
        ${permits[0]}, 'multipart_reconciled', 'integration operator') as reconciled`)
        .toEqual([{ reconciled: false }]);
      expect(await migrator`select public.reconcile_account_purge_provider_operation(
        ${permits[0]}, 'provider_confirmed_absent', 'integration operator') as reconciled`)
        .toEqual([{ reconciled: true }]);
      expect(await migrator`select public.reconcile_account_purge_provider_operation(
        ${permits[1]}, 'provider_confirmed_absent', 'integration operator') as reconciled`)
        .toEqual([{ reconciled: false }]);
      expect(await migrator`select public.reconcile_account_purge_provider_operation(
        ${permits[1]}, 'provider_confirmed_completed', 'integration operator') as reconciled`)
        .toEqual([{ reconciled: false }]);
      await migrator.begin(async (transaction) => {
        expect(await transaction`select public.reconcile_account_purge_provider_operation(
          ${permits[1]}, 'multipart_reconciled', 'integration operator') as reconciled`)
          .toEqual([{ reconciled: true }]);
        expect(await secondWorker`select public.resume_account_purge_provider_operations(
          ${incidentEpoch}, clock_timestamp() + interval '5 minutes', 'racing resume', 'integration operator') as resumed`)
          .toEqual([{ resumed: false }]);
      });
      const [closedPermit] = await migrator`select task_id is null as task_erased,
        owner_id is null as owner_erased, worker_lease_token is null as lease_erased,
        char_length(task_id_digest) = 64 as task_digest,
        char_length(owner_id_digest) = 64 as owner_digest,
        char_length(worker_lease_digest) = 64 as lease_digest,
        retention_expires_at = resolved_at + interval '30 days' as bounded_retention,
        resolution from public.account_purge_provider_operation_permits where id = ${permits[1]}`;
      expect(closedPermit).toEqual({ task_erased: true, owner_erased: true, lease_erased: true,
        task_digest: true, owner_digest: true, lease_digest: true, bounded_retention: true,
        resolution: "multipart_reconciled" });
      expect(await migrator`select public.refresh_account_purge_provider_drain() as state`)
        .toEqual([{ state: "paused" }]);
      expect(await migrator`select public.resume_account_purge_provider_operations(
        ${incidentEpoch}, clock_timestamp() + interval '5 minutes', 'reconciled resume', 'integration operator') as resumed`)
        .toEqual([{ resumed: true }]);

      // Pause fenced the old lease, and reapproval did not revive it.
      expect(await migrator`select * from public.start_account_purge_provider_operation(
        ${`old-lease-${crypto.randomUUID()}`}, ${jobs[0].task_id}, 3, ${lease}, 'delete_object',
        clock_timestamp() + interval '30 seconds')`).toEqual([]);
      expect(await migrator`select * from public.start_account_purge_provider_operation(
        ${`wrong-generation-${crypto.randomUUID()}`}, ${jobs[0].task_id}, 4, ${lease}, 'delete_object',
        clock_timestamp() + interval '30 seconds')`).toEqual([]);
      await migrator`update public.account_purge_object_cleanup_tasks
        set next_attempt_at = 'infinity'::timestamptz where id in (${jobs[0].task_id}, ${jobs[1].task_id})`;
      await migrator`with cutoff as (select clock_timestamp() - interval '31 days' as resolved)
        update public.account_purge_provider_operation_permits permit
        set resolved_at = cutoff.resolved, retention_expires_at = cutoff.resolved + interval '30 days'
        from cutoff where permit.id = ${permits[0]}`;
      expect(await migrator`select public.delete_expired_account_purge_provider_permits(10) as deleted`)
        .toEqual([{ deleted: 1 }]);
      const [retainedIncidentEvidence] = await migrator`select count(*)::integer as count
        from public.account_purge_provider_operation_permits where id = ${permits[1]}`;
      expect(retainedIncidentEvidence.count).toBe(1);
    } finally {
      await secondWorker.end({ timeout: 5 });
    }
  });

  it("denies provider permit and pause controls to reporting and app roles", async () => {
    const calls = [
      "select * from public.start_account_purge_provider_operation('x', 'x', 1, 'x', 'delete_object', clock_timestamp() + interval '30 seconds')",
      "select public.finish_account_purge_provider_operation('x', 'x', 1, 'x', true)",
      "select public.begin_account_purge_provider_pause(1, 'x', 'x')",
      "select public.refresh_account_purge_provider_drain()",
      "select public.reconcile_account_purge_provider_operation('x', 'provider_confirmed_absent', 'x')",
      "select public.resume_account_purge_provider_operations(1, clock_timestamp() + interval '1 minute', 'x', 'x')",
      "select public.delete_expired_account_purge_provider_permits(1)",
    ];
    for (const client of [app, lifecycleWorker]) {
      for (const call of calls) await expect(client.unsafe(call)).rejects.toMatchObject({ code: "42501" });
      await expect(client`select * from public.account_purge_provider_operation_permits`).rejects.toMatchObject({ code: "42501" });
    }
  });

  it("keeps the lifecycle worker report-only and fails closed when operator state is missing", async () => {
    for (const call of [
      "select * from public.claim_account_purge_cleanup(1, 'forbidden', 60)",
      "select public.authorize_account_purge_cleanup('forbidden', 1, 'forbidden')",
      "select public.complete_account_purge_cleanup('forbidden', 1, 'forbidden')",
      "select public.retry_account_purge_cleanup('forbidden', 1, 'forbidden', 30)",
      "select public.delete_expired_account_purge_receipts(1)",
    ]) await expect(lifecycleWorker.unsafe(call)).rejects.toMatchObject({ code: "42501" });

    await migrator`delete from public.account_purge_operator_control`;
    const [report] = await lifecycleWorker`select * from public.report_account_purge_operator_control()`;
    expect(report).toMatchObject({ paused: true, control_fresh: false });
    await migrator`insert into public.account_purge_operator_control (singleton) values (true)`;
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
    const [job] = await migrator`select * from public.claim_account_purge_cleanup(1, ${lease}, 60)`;
    expect(job.export_cleanup_task_id).toBe(taskId);
    expect(await migrator`select public.complete_account_purge_cleanup(${job.task_id}, 1, ${lease}) as completed`)
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
    const claimed = await migrator`select * from public.claim_account_purge_cleanup(10, ${lease}, 60)`;
    const firstJob = claimed.find((job) => job.owner_id === firstOwner)!;
    const secondJob = claimed.find((job) => job.owner_id === secondOwner)!;
    const secondWorker = postgres(migratorConnection, { max: 1, prepare: false, onnotice: () => undefined });
    try {
      const [firstCompletion, secondCompletion] = await Promise.all([
        migrator`select public.complete_account_purge_cleanup(${firstJob.task_id}, 1, ${lease}) as completed`,
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
    expect(await migrator`select public.delete_expired_account_purge_receipts(1) as deleted`)
      .toEqual([{ deleted: 1 }]);
    const [present] = await migrator`select exists(select 1 from public.account_purge_receipts where request_id = ${requestId}) as present`;
    expect(present?.present).toBe(false);
  });

  it("durably leases, fences, and supersedes realtime revocation generations", async () => {
    const userId = await createUser("realtime-revocation");
    const requestId = `realtime-request-${crypto.randomUUID()}`;
    const lease = `realtime-lease-${crypto.randomUUID()}`;
    const requestedAt = new Date();
    await app`insert into public.account_lifecycles
      (user_id, state, request_id, idempotency_key_digest, generation, requested_at, cancel_until, purge_due_at)
      values (${userId}, 'pending_deletion', ${requestId}, ${"d".repeat(64)}, 1,
        ${requestedAt}, ${new Date(requestedAt.getTime() + 168 * 60 * 60_000)},
        ${new Date(requestedAt.getTime() + 336 * 60 * 60_000)})`;
    expect(await app`select public.enqueue_account_realtime_revocation(${userId}, 1) as accepted`)
      .toEqual([{ accepted: true }]);
    expect(await app`select public.enqueue_account_realtime_revocation(${userId}, 1) as accepted`)
      .toEqual([{ accepted: true }]);
    await expect(app`select * from public.account_realtime_revocations`).rejects.toMatchObject({ code: "42501" });
    const claimed = await lifecycleWorker`select * from public.claim_account_realtime_revocations(1, ${lease}, 60)`;
    expect(claimed).toEqual([{ owner_id: userId, lifecycle_generation: "1", attempt_count: "1", lease_token: lease }]);
    expect(await lifecycleWorker`select public.complete_account_realtime_revocation(${userId}, 1, 'wrong') as accepted`)
      .toEqual([{ accepted: false }]);

    await app`update public.account_lifecycles set state = 'active', request_id = null,
      idempotency_key_digest = null, generation = 2, requested_at = null, cancel_until = null,
      purge_due_at = null, updated_at = clock_timestamp() where user_id = ${userId}`;
    expect(await lifecycleWorker`select public.complete_account_realtime_revocation(${userId}, 1, ${lease}) as accepted`)
      .toEqual([{ accepted: true }]);
    const status = await migrator`select status, retention_expires_at = completed_at + interval '720 hours' as retained
      from public.account_realtime_revocations where user_id = ${userId} and lifecycle_generation = 1`;
    expect(status).toEqual([{ status: "superseded", retained: true }]);
    const report = await lifecycleWorker`select * from public.report_account_realtime_revocations()`;
    expect(Number(report[0]?.superseded_count)).toBeGreaterThanOrEqual(1);

    await migrator`update public.account_realtime_revocations set completed_at = expiry.completed,
      retention_expires_at = expiry.completed + interval '720 hours'
      from (select clock_timestamp() - interval '721 hours' as completed) expiry
      where user_id = ${userId} and lifecycle_generation = 1`;
    expect(await lifecycleWorker`select public.prune_account_realtime_revocations(1) as deleted`).toEqual([{ deleted: 1 }]);
    const [remaining] = await migrator`select exists(select 1 from public.account_realtime_revocations
      where user_id = ${userId} and lifecycle_generation = 1) as present`;
    expect(remaining?.present).toBe(false);
  });

  it("bounds cancelled-row reconciliation independently of returned claims", async () => {
    const owners: string[] = [];
    for (let index = 0; index < 5; index += 1) {
      const userId = await createUser(`realtime-cancelled-${index}`);
      owners.push(userId);
      const requestedAt = new Date(Date.now() + index);
      await app`insert into public.account_lifecycles
        (user_id, state, request_id, idempotency_key_digest, generation, requested_at, cancel_until, purge_due_at)
        values (${userId}, 'pending_deletion', ${crypto.randomUUID()}, ${"e".repeat(64)}, 1,
          ${requestedAt}, ${new Date(requestedAt.getTime() + 168 * 60 * 60_000)},
          ${new Date(requestedAt.getTime() + 336 * 60 * 60_000)})`;
      await app`select public.enqueue_account_realtime_revocation(${userId}, 1)`;
      await app`update public.account_lifecycles set state = 'active', request_id = null,
        idempotency_key_digest = null, generation = 2, requested_at = null, cancel_until = null,
        purge_due_at = null, updated_at = clock_timestamp() where user_id = ${userId}`;
    }
    expect(await lifecycleWorker`select * from public.claim_account_realtime_revocations(1, ${crypto.randomUUID()}, 60)`).toEqual([]);
    const [counts] = await migrator`select count(*) filter (where status = 'superseded')::integer as superseded,
      count(*) filter (where status = 'pending')::integer as pending
      from public.account_realtime_revocations where user_id = any(${owners})`;
    expect(counts).toEqual({ superseded: 4, pending: 1 });
  });

  it("denies app and lifecycle_worker direct physical purge access", async () => {
    const userId = await createUser("privileges");

    await expect(app`delete from public."user" where id = ${userId}`).rejects.toMatchObject({ code: "42501" });
    await expect(lifecycleWorker`select * from public.account_lifecycles`).rejects.toMatchObject({ code: "42501" });
    await expect(lifecycleWorker`delete from public."user" where id = ${userId}`).rejects.toMatchObject({ code: "42501" });
    await expect(app`select * from public.operator_cases`).rejects.toMatchObject({ code: "42501" });
  });
});
