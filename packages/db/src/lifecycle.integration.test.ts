import { readFile } from "node:fs/promises";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { repoPath } from "./migrations/paths";

const migratorUrl = process.env.TEST_DATABASE_URL;
const appUrl = process.env.TEST_APP_DATABASE_URL;
const lifecycleWorkerUrl = process.env.TEST_LIFECYCLE_WORKER_DATABASE_URL;
const enabled = Boolean(migratorUrl && appUrl && lifecycleWorkerUrl);
const testPostgresPort = process.env.VERIFY_POSTGRES_PORT ?? "5433";

function requireLocalTestUrl(value: string | undefined, name: string, user: string): string {
  if (!value) throw new Error(`${name} is required for lifecycle database integration tests.`);
  const url = new URL(value);
  if (url.hostname !== "localhost" || url.port !== testPostgresPort || !["/dayli_test", "/dayli_lifecycle_test"].includes(url.pathname) || url.username !== user) {
    throw new Error(`${name} must target ${user}@localhost:${testPostgresPort}/dayli_test or dayli_lifecycle_test.`);
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
      if (legalVersions.length > 0) await migrator`delete from public.legal_document_versions where id = any(${legalVersions}) and not publication_latched`;
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
      values (${versionId}, 'terms', ${Math.floor(Math.random() * 1_000_000_000) + 1}, ${"b".repeat(64)}, 'effective', '2026-09-30T00:00:00.000Z')
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

  it("requires provenance for every material Terms publication, without blocking nonmaterial changes", async () => {
    const versionBase = Math.floor(Math.random() * 1_000_000_000) + 1;
    const ids = Array.from({ length: 7 }, (_, index) => `terms-publication-${index}-${crypto.randomUUID()}`);
    legalVersions.push(...ids);
    const startsAt = "2026-09-01T00:00:00.000Z";

    // A migrator cannot bypass the policy by publishing a material document directly.
    await expect(migrator`
      insert into public.legal_document_versions (id, kind, version, content_digest, status, material_change, effective_at)
      values (${ids[0]}, 'terms', ${versionBase}, ${"e".repeat(64)}, 'effective', true, '2026-09-01T00:00:00.000Z')
    `).rejects.toMatchObject({ code: "23514" });
    await expect(migrator`
      insert into public.legal_document_versions (id, kind, version, content_digest, status, material_change, notice_starts_at, effective_at)
      values (${ids[1]}, 'terms', ${versionBase + 1}, ${"f".repeat(64)}, 'effective', true, null, '2026-10-01T00:00:00.000Z')
    `).rejects.toMatchObject({ code: "23514" });

    await migrator`
      insert into public.legal_document_versions (id, kind, version, content_digest, status, material_change, notice_starts_at, effective_at)
      values (${ids[2]}, 'terms', ${versionBase + 2}, ${"a".repeat(64)}, 'notice', true, ${startsAt}, '2026-10-01T00:00:00.000Z')
    `;
    await expect(migrator`
      update public.legal_document_versions set status = 'effective', effective_at = '2026-09-30T23:59:59.000Z' where id = ${ids[2]}
    `).rejects.toMatchObject({ code: "23514" });

    // Exactly 30 days is allowed, as is a concrete urgent publication reason.
    await migrator`
      insert into public.legal_document_versions (id, kind, version, content_digest, status, material_change, notice_starts_at, effective_at)
      values (${ids[3]}, 'terms', ${versionBase + 3}, ${"b".repeat(64)}, 'effective', true, ${startsAt}, '2026-10-01T00:00:00.000Z')
    `;
    await migrator`
      insert into public.legal_document_versions (id, kind, version, content_digest, status, material_change, effective_at, urgent_change_reason)
      values (${ids[4]}, 'terms', ${versionBase + 4}, ${"c".repeat(64)}, 'effective', true, '2026-09-02T00:00:00.000Z', 'Critical security correction')
    `;
    for (const reason of ["", "   ", " urgent "]) {
      await expect(migrator`
        insert into public.legal_document_versions (id, kind, version, content_digest, status, material_change, effective_at, urgent_change_reason)
        values (${`${ids[5]}-${reason.length}-${crypto.randomUUID()}`}, 'terms', ${versionBase + 10 + reason.length}, ${"d".repeat(64)}, 'effective', true, '2026-09-02T00:00:00.000Z', ${reason})
      `).rejects.toMatchObject({ code: "23514" });
    }
    await migrator`
      insert into public.legal_document_versions (id, kind, version, content_digest, status, material_change, effective_at)
      values (${ids[6]}, 'terms', ${versionBase + 20}, ${"e".repeat(64)}, 'effective', false, '2026-09-02T00:00:00.000Z')
    `;
  });

  it("latches published and accepted Terms against migrator content replacement", async () => {
    const userId = await createUser("immutable-terms");
    const versionBase = Math.floor(Math.random() * 1_000_000_000) + 1;
    const versionId = `terms-immutable-${crypto.randomUUID()}`;
    const replacementId = `terms-replacement-${crypto.randomUUID()}`;
    const canonicalContent = "# Immutable Terms\n\nAccepted canonical bytes.";
    const replacementContent = "# Replaced Terms\n\nUnauthorized replacement bytes.";
    const hash = async (value: string) => [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)))]
      .map((byte) => byte.toString(16).padStart(2, "0")).join("");
    const digest = await hash(canonicalContent);
    const replacementDigest = await hash(replacementContent);
    legalVersions.push(versionId, replacementId);

    await migrator`
      insert into public.legal_document_versions (id, kind, version, content_digest)
      values (${versionId}, 'terms', ${versionBase}, ${digest})
    `;
    await migrator`
      insert into public.legal_document_contents (terms_version_id, canonical_content)
      values (${versionId}, ${canonicalContent})
    `;
    await migrator`
      update public.legal_document_versions
      set status = 'notice', notice_starts_at = '2026-09-01T00:00:00.000Z', effective_at = '2026-10-01T00:00:00.000Z'
      where id = ${versionId}
    `;
    await migrator`
      update public.legal_document_versions set status = 'effective' where id = ${versionId}
    `;
    await app`
      insert into public.terms_acceptances (user_id, terms_version_id)
      values (${userId}, ${versionId})
    `;

    await expect(migrator.begin(async (tx) => {
      await tx`update public.legal_document_contents set canonical_content = ${replacementContent} where terms_version_id = ${versionId}`;
      await tx`update public.legal_document_versions set content_digest = ${replacementDigest} where id = ${versionId}`;
    })).rejects.toMatchObject({ code: "23514" });
    await expect(migrator`delete from public.legal_document_contents where terms_version_id = ${versionId}`)
      .rejects.toMatchObject({ code: "23514" });
    await migrator`
      insert into public.legal_document_versions (id, kind, version, content_digest)
      values (${replacementId}, 'terms', ${versionBase + 1}, ${replacementDigest})
    `;
    await expect(migrator`update public.legal_document_contents set terms_version_id = ${replacementId} where terms_version_id = ${versionId}`)
      .rejects.toMatchObject({ code: "23514" });
    await migrator`
      insert into public.legal_document_contents (terms_version_id, canonical_content)
      values (${replacementId}, ${replacementContent})
    `;
    await migrator`
      update public.legal_document_versions
      set status = 'notice', notice_starts_at = '2026-11-01T00:00:00.000Z', effective_at = '2026-12-01T00:00:00.000Z'
      where id = ${replacementId}
    `;
    await migrator`update public.legal_document_versions set status = 'effective' where id = ${replacementId}`;
    await expect(migrator`update public.legal_document_versions set status = 'draft' where id = ${versionId}`)
      .rejects.toMatchObject({ code: "23514" });
    await expect(migrator`update public.legal_document_versions set kind = 'privacy_policy' where id = ${versionId}`)
      .rejects.toMatchObject({ code: "23514" });

    const [stored] = await migrator`
      select lv.content_digest, lc.canonical_content, lv.publication_latched
      from public.legal_document_versions lv
      join public.legal_document_contents lc on lc.terms_version_id = lv.id
      where lv.id = ${versionId}
    `;
    expect(stored).toEqual({ content_digest: digest, canonical_content: canonicalContent, publication_latched: true });
    await migrator`update public.legal_document_versions set status = 'superseded' where id = ${versionId}`;
  });

  it("serializes content edits with publication and acceptance latches", async () => {
    const publisher = postgres(migratorConnection, { max: 1, prepare: false, onnotice: () => undefined });
    const writer = postgres(migratorConnection, { max: 1, prepare: false, onnotice: () => undefined });
    const acceptor = postgres(appConnection, { max: 1, prepare: false, onnotice: () => undefined });
    const waitForLock = async (pid: number) => {
      for (let attempt = 0; attempt < 80; attempt += 1) {
        const [state] = await migrator`select wait_event_type = 'Lock' as blocked from pg_stat_activity where pid = ${pid}`;
        if (state?.blocked) return;
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
      throw new Error("Expected a database lock wait.");
    };
    const hash = async (value: string) => [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)))]
      .map((byte) => byte.toString(16).padStart(2, "0")).join("");
    const base = Math.floor(Math.random() * 1_000_000_000) + 1;
    const draftContent = "# Draft Terms\n\nOriginal bytes.";
    const updatedContent = "# Draft Terms\n\nEdited before publication.";
    const draftDigest = await hash(draftContent);
    const updatedDigest = await hash(updatedContent);
    const publicationId = `terms-lock-publication-${crypto.randomUUID()}`;
    const acceptanceId = `terms-lock-acceptance-${crypto.randomUUID()}`;
    const reverseId = `terms-lock-reverse-${crypto.randomUUID()}`;
    const rekeySourceId = `terms-lock-rekey-source-${crypto.randomUUID()}`;
    const rekeyTargetId = `terms-lock-rekey-target-${crypto.randomUUID()}`;
    legalVersions.push(publicationId, acceptanceId, reverseId, rekeySourceId, rekeyTargetId);
    const acceptanceUser = await createUser("lock-acceptance");

    try {
      await migrator`insert into public.legal_document_versions (id, kind, version, content_digest) values (${publicationId}, 'terms', ${base}, ${draftDigest})`;
      await migrator`insert into public.legal_document_contents (terms_version_id, canonical_content) values (${publicationId}, ${draftContent})`;
      await publisher.unsafe("begin");
      await publisher`update public.legal_document_versions set status = 'notice', notice_starts_at = '2026-09-01T00:00:00.000Z', effective_at = '2026-10-01T00:00:00.000Z' where id = ${publicationId}`;
      const [{ pid: writerPid }] = await writer`select pg_backend_pid()::int as pid`;
      const blockedContent = writer`update public.legal_document_contents set canonical_content = ${updatedContent} where terms_version_id = ${publicationId}`.then((result) => result);
      await waitForLock(writerPid);
      await publisher.unsafe("commit");
      await expect(blockedContent).rejects.toMatchObject({ code: "23514" });
      const [published] = await migrator`select canonical_content, publication_latched from public.legal_document_contents c join public.legal_document_versions v on v.id = c.terms_version_id where v.id = ${publicationId}`;
      expect(published).toEqual({ canonical_content: draftContent, publication_latched: true });

      await migrator`insert into public.legal_document_versions (id, kind, version, content_digest) values (${acceptanceId}, 'terms', ${base + 1}, ${draftDigest})`;
      await migrator`insert into public.legal_document_contents (terms_version_id, canonical_content) values (${acceptanceId}, ${draftContent})`;
      await acceptor.unsafe("begin");
      await acceptor`insert into public.terms_acceptances (user_id, terms_version_id) values (${acceptanceUser}, ${acceptanceId})`;
      const [{ pid: acceptanceWriterPid }] = await writer`select pg_backend_pid()::int as pid`;
      const blockedAcceptanceContent = writer`update public.legal_document_contents set canonical_content = ${updatedContent} where terms_version_id = ${acceptanceId}`.then((result) => result);
      await waitForLock(acceptanceWriterPid);
      await acceptor.unsafe("commit");
      await expect(blockedAcceptanceContent).rejects.toMatchObject({ code: "23514" });
      const [accepted] = await migrator`select canonical_content, publication_latched from public.legal_document_contents c join public.legal_document_versions v on v.id = c.terms_version_id where v.id = ${acceptanceId}`;
      expect(accepted).toEqual({ canonical_content: draftContent, publication_latched: true });

      await migrator`insert into public.legal_document_versions (id, kind, version, content_digest) values (${rekeySourceId}, 'terms', ${base + 2}, ${draftDigest})`;
      await migrator`insert into public.legal_document_versions (id, kind, version, content_digest) values (${rekeyTargetId}, 'terms', ${base + 3}, ${draftDigest})`;
      await migrator`insert into public.legal_document_contents (terms_version_id, canonical_content) values (${rekeySourceId}, ${draftContent})`;
      await publisher.unsafe("begin");
      await publisher`update public.legal_document_versions set status = 'notice', notice_starts_at = '2026-10-01T00:00:00.000Z', effective_at = '2026-11-01T00:00:00.000Z' where id = ${rekeyTargetId}`;
      const [{ pid: rekeyWriterPid }] = await writer`select pg_backend_pid()::int as pid`;
      const blockedRekey = writer`update public.legal_document_contents set terms_version_id = ${rekeyTargetId} where terms_version_id = ${rekeySourceId}`.then((result) => result);
      await waitForLock(rekeyWriterPid);
      await publisher.unsafe("commit");
      await expect(blockedRekey).rejects.toMatchObject({ code: "23514" });
      const [rekeySource] = await migrator`select canonical_content from public.legal_document_contents where terms_version_id = ${rekeySourceId}`;
      const [rekeyTarget] = await migrator`select count(*)::int as contents from public.legal_document_contents where terms_version_id = ${rekeyTargetId}`;
      expect(rekeySource).toEqual({ canonical_content: draftContent });
      expect(rekeyTarget).toEqual({ contents: 0 });

      await migrator`insert into public.legal_document_versions (id, kind, version, content_digest) values (${reverseId}, 'terms', ${base + 4}, ${draftDigest})`;
      await migrator`insert into public.legal_document_contents (terms_version_id, canonical_content) values (${reverseId}, ${draftContent})`;
      await writer.unsafe("begin");
      await writer`update public.legal_document_contents set canonical_content = ${updatedContent} where terms_version_id = ${reverseId}`;
      const [{ pid: publisherPid }] = await publisher`select pg_backend_pid()::int as pid`;
      const blockedPublication = publisher`update public.legal_document_versions set content_digest = ${updatedDigest}, status = 'notice', notice_starts_at = '2026-11-01T00:00:00.000Z', effective_at = '2026-12-01T00:00:00.000Z' where id = ${reverseId}`.then((result) => result);
      await waitForLock(publisherPid);
      await writer.unsafe("commit");
      await blockedPublication;
      const [stable] = await migrator`select v.content_digest, c.canonical_content, v.publication_latched from public.legal_document_versions v join public.legal_document_contents c on c.terms_version_id = v.id where v.id = ${reverseId}`;
      expect(stable).toEqual({ content_digest: updatedDigest, canonical_content: updatedContent, publication_latched: true });
    } finally {
      await Promise.allSettled([publisher.unsafe("rollback"), writer.unsafe("rollback"), acceptor.unsafe("rollback")]);
      await Promise.all([publisher.end({ timeout: 5 }), writer.end({ timeout: 5 }), acceptor.end({ timeout: 5 })]);
    }
  });

  it("keeps export cleanup tasks private after reapplying role bootstrap", async () => {
    const bootstrap = await readFile(repoPath("packages/db/admin/bootstrap-migrator.sql"), "utf8");
    await migrator.unsafe(bootstrap);

    const privileges = await migrator`
      select role_name,
        has_table_privilege(role_name, 'public.data_export_object_cleanup_tasks', 'SELECT') as can_select,
        has_table_privilege(role_name, 'public.data_export_object_cleanup_tasks', 'INSERT') as can_insert,
        has_table_privilege(role_name, 'public.data_export_object_cleanup_tasks', 'UPDATE') as can_update,
        has_table_privilege(role_name, 'public.data_export_object_cleanup_tasks', 'DELETE') as can_delete
      from (values ('app'), ('lifecycle_worker')) as roles(role_name)
      order by role_name
    `;
    expect(privileges).toEqual([
      { role_name: "app", can_select: false, can_insert: false, can_update: false, can_delete: false },
      { role_name: "lifecycle_worker", can_select: false, can_insert: false, can_update: false, can_delete: false },
    ]);
    for (const client of [app, lifecycleWorker]) {
      await expect(client`select * from public.data_export_object_cleanup_tasks`).rejects.toMatchObject({ code: "42501" });
      await expect(client`insert into public.data_export_object_cleanup_tasks default values`).rejects.toMatchObject({ code: "42501" });
      await expect(client`update public.data_export_object_cleanup_tasks set status = 'pending' where false`).rejects.toMatchObject({ code: "42501" });
      await expect(client`delete from public.data_export_object_cleanup_tasks where false`).rejects.toMatchObject({ code: "42501" });
    }
  });

  it("preserves the complete lifecycle, legal, private, and proof privilege matrix after bootstrap", async () => {
    const bootstrap = await readFile(repoPath("packages/db/admin/bootstrap-migrator.sql"), "utf8");
    await migrator.unsafe(bootstrap);
    const expected = {
      account_lifecycles: [true, true, true, false],
      account_management_grants: [true, true, true, false],
      account_google_reauthentication_intents: [true, true, true, false],
      age_declarations: [true, true, false, false],
      data_export_requests: [true, true, true, false],
      data_export_object_cleanup_tasks: [false, false, false, false],
      legal_document_contents: [true, false, false, false],
      legal_document_versions: [true, false, false, false],
      operator_cases: [false, false, false, false],
      registration_intents: [true, true, true, false],
      terms_acceptances: [true, true, false, false],
      account_purge_receipts: [false, false, false, false],
    } as const;
    for (const [table, permissions] of Object.entries(expected)) {
      const rows = await migrator`select has_table_privilege('app', ${`public.${table}`}, 'SELECT') as "select", has_table_privilege('app', ${`public.${table}`}, 'INSERT') as "insert", has_table_privilege('app', ${`public.${table}`}, 'UPDATE') as "update", has_table_privilege('app', ${`public.${table}`}, 'DELETE') as "delete", has_table_privilege('lifecycle_worker', ${`public.${table}`}, 'SELECT') as worker_select`;
      expect(rows[0]).toEqual({ select: permissions[0], insert: permissions[1], update: permissions[2], delete: permissions[3], worker_select: false });
    }
    await expect(app`delete from public.account_google_reauthentication_intents where false`).rejects.toMatchObject({ code: "42501" });
    for (const statement of [
      lifecycleWorker`select * from public.account_google_reauthentication_intents`,
      lifecycleWorker`insert into public.account_google_reauthentication_intents default values`,
      lifecycleWorker`update public.account_google_reauthentication_intents set consumed_at = now() where false`,
      lifecycleWorker`delete from public.account_google_reauthentication_intents where false`,
    ]) await expect(statement).rejects.toMatchObject({ code: "42501" });
    const functions = await migrator`select coalesce(bool_or((entry).grantee = 0 and (entry).privilege_type = 'EXECUTE'), false) as public_execute, has_function_privilege('app', 'public.account_policy_underage_restricted(text)', 'EXECUTE') as app_execute, has_function_privilege('lifecycle_worker', 'public.account_policy_underage_restricted(text)', 'EXECUTE') as worker_execute from pg_proc cross join lateral aclexplode(proacl) entry where oid = 'public.account_policy_underage_restricted(text)'::regprocedure`;
    expect(functions[0]).toEqual({ public_execute: false, app_execute: true, worker_execute: false });
  });

  it("projects only active reviewed underage restrictions", async () => {
    const userId = await createUser("underage-projection");
    const caseId = `case-${crypto.randomUUID()}`;
    await migrator`insert into public.operator_cases (id, subject_user_id, type, status, decision, review_due_at, reviewed_at) values (${caseId}, ${userId}, 'underage_report', 'open', null, now() + interval '1 hour', null)`;
    await expect(app`select public.account_policy_underage_restricted(${userId}) as restricted`).resolves.toEqual([{ restricted: false }]);
    await migrator`update public.operator_cases set status = 'restricted', decision = 'temporary_restriction', reviewed_at = now() where id = ${caseId}`;
    await expect(app`select public.account_policy_underage_restricted(${userId}) as restricted`).resolves.toEqual([{ restricted: true }]);
    await migrator`update public.operator_cases set review_due_at = now() - interval '1 second' where id = ${caseId}`;
    await expect(app`select public.account_policy_underage_restricted(${userId}) as restricted`).resolves.toEqual([{ restricted: false }]);
    await expect(app`select * from public.operator_cases`).rejects.toMatchObject({ code: "42501" });
    await expect(app`update public.operator_cases set status = 'closed' where id = ${caseId}`).rejects.toMatchObject({ code: "42501" });
  });

  it("claims and fences export publication through the lifecycle worker procedures", async () => {
    const userId = await createUser("export-worker");
    const exportId = `export-${crypto.randomUUID()}`;
    await app`insert into public.account_lifecycles (user_id) values (${userId})`;
    await app`insert into public.data_export_requests (id, user_id, lifecycle_generation, status) values (${exportId}, ${userId}, 0, 'requested')`;
    await expect(app`select * from public.dayli_export_claim(${'a'.repeat(32)}, 300)`).rejects.toMatchObject({ code: "42501" });
    const claimed = await lifecycleWorker`select * from public.dayli_export_claim(${'a'.repeat(32)}, 300)`;
    expect(claimed).toHaveLength(1);
    expect(claimed[0]?.id).toBe(exportId);
    await expect(lifecycleWorker`select * from public.data_export_requests`).rejects.toMatchObject({ code: "42501" });
    await expect(lifecycleWorker`select public.dayli_export_publish(${exportId}, ${'wrong'.repeat(8)}, 0, 'private/forged.zip', now())`).resolves.toEqual([{ dayli_export_publish: false }]);
    const key = `private/data-exports/${exportId}/${"a".repeat(32)}.zip`;
    await expect(lifecycleWorker`select public.dayli_export_reserve_object(${exportId}, ${'a'.repeat(32)})`).resolves.toEqual([{ dayli_export_reserve_object: key }]);
    const [reservation] = await migrator`select next_attempt_at > now() as deferred from public.data_export_object_cleanup_tasks where id = ${`export-attempt-${exportId}-${"a".repeat(32)}`}`;
    expect(reservation).toEqual({ deferred: true });
    const [{ snapshot_cutoff_at: cutoff }] = await migrator`select snapshot_cutoff_at from public.data_export_requests where id = ${exportId}`;
    await expect(lifecycleWorker`select public.dayli_export_publish(${exportId}, ${'a'.repeat(32)}, 0, ${key}, ${cutoff})`).resolves.toEqual([{ dayli_export_publish: true }]);
    const ready = await migrator`select status, archive_object_key, expires_at = ready_at + interval '24 hours' as exact_expiry from public.data_export_requests where id = ${exportId}`;
    expect(ready[0]).toEqual({ status: "ready", archive_object_key: key, exact_expiry: true });
    await expect(lifecycleWorker`select public.dayli_export_cancel_for_purge(${userId})`).resolves.toEqual([{ dayli_export_cancel_for_purge: 1 }]);
    const expired = await migrator`select status, archive_object_key, archive_cleanup_task_id from public.data_export_requests where id = ${exportId}`;
    expect(expired[0]?.status).toBe("expired");
    expect(expired[0]?.archive_object_key).toBeNull();
    expect(expired[0]?.archive_cleanup_task_id).toBe(`export-cleanup-${exportId}`);
  });

  it("denies app and lifecycle_worker direct physical purge access", async () => {
    const userId = await createUser("privileges");

    await expect(app`delete from public."user" where id = ${userId}`).rejects.toMatchObject({ code: "42501" });
    await expect(lifecycleWorker`select * from public.account_lifecycles`).rejects.toMatchObject({ code: "42501" });
    await expect(lifecycleWorker`delete from public."user" where id = ${userId}`).rejects.toMatchObject({ code: "42501" });
    await expect(app`select * from public.operator_cases`).rejects.toMatchObject({ code: "42501" });
  });
});
