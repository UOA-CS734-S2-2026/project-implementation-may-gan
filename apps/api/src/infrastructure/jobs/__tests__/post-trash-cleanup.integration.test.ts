import { createServer } from "node:http";
import { once } from "node:events";
import { createDayliDatabase, schema, sql } from "@dayli/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPostgresSetAvatarRepository } from "../../../features/profiles/set-avatar/set-avatar.repository";
import { createPostgresPostTrashRepository } from "../../../features/posts/trash-post/trash-post.repository";
import { createPostgresPostTrashCleanupStore } from "../post-trash-cleanup";
import { provePostTrashCleanupAdmission, runPostTrashCleanupForEnv } from "../post-trash-runtime";

const migratorUrl = process.env.TEST_DATABASE_URL;
const appUrl = process.env.TEST_APP_DATABASE_URL;
const workerUrl = process.env.TEST_POST_TRASH_WORKER_DATABASE_URL;
const enabled = Boolean(migratorUrl && appUrl && workerUrl && process.env.POSTS_POSTGRES_TEST === "1");
const port = process.env.VERIFY_POSTGRES_PORT ?? "5433";
function fixtureUrl(value: string) {
  const parsed = new URL(value);
  if (parsed.hostname !== "localhost" || parsed.port !== port || parsed.pathname !== "/dayli_test") {
    throw new Error("Post Trash integration tests require an isolated localhost dayli_test database.");
  }
  return value;
}

(enabled ? describe : describe.skip)("Post Trash PostgreSQL authorization and reference fences", () => {
  const migrator = createDayliDatabase(fixtureUrl(migratorUrl ?? `postgresql://migrator:migrator@localhost:${port}/dayli_test`));
  const app = createDayliDatabase(fixtureUrl(appUrl ?? `postgresql://app:app@localhost:${port}/dayli_test`));
  const worker = createDayliDatabase(fixtureUrl(workerUrl ?? `postgresql://lifecycle_worker:lifecycle_worker@localhost:${port}/dayli_test`));
  const nonce = crypto.randomUUID().replaceAll("-", "").slice(0, 12);
  const id = (part: string) => `trash-${nonce}-${part}`;
  const owner = id("owner");
  const other = id("other");
  const session = id("session");
  const otherSession = id("other-session");
  const post = id("post");
  const replacement = id("replacement");
  const accountPost = id("account-pending");
  const sharedPost = id("shared-post");
  const laterPost = id("later-post");
  const sharedReservation = id("shared-reservation");
  const runtimePost = id("runtime-post");
  const runtimeReservation = id("runtime-reservation");
  const runtimeMedia = id("runtime-media");
  const media = id("media");
  const reservation = id("reservation");
  const postRepo = createPostgresPostTrashRepository(app.db);
  const cleanup = createPostgresPostTrashCleanupStore(worker.db);
  const date = "2026-10-02";

  async function createPost(postId: string) {
    await migrator.db.insert(schema.posts).values({
      id: postId, authorId: owner, localDate: date, promptId: "prompt-10-02",
      reflectiveAnswer: "Synthetic fixture", rating: 5, audience: "solo",
      acceptedAt: new Date("2026-10-02T01:00:00Z"), releasedAt: new Date("2026-10-02T12:00:00Z"),
    });
  }

  beforeAll(async () => {
    await migrator.db.insert(schema.user).values([
      { id: owner, name: "Trash owner", email: `${owner}@example.test`, username: `t${nonce}owner` },
      { id: other, name: "Other user", email: `${other}@example.test`, username: `t${nonce}other` },
    ]);
    await migrator.db.insert(schema.session).values([
      { id: session, token: id("token"), userId: owner, expiresAt: new Date("2090-01-01T00:00:00Z") },
      { id: otherSession, token: id("other-token"), userId: other, expiresAt: new Date("2090-01-01T00:00:00Z") },
    ]);
    await createPost(post);
    await migrator.db.insert(schema.mediaReservation).values({
      id: reservation, ownerId: owner, objectKey: `media/${owner}/${media}`,
      status: "validated", contentType: "image/jpeg", byteSize: 1024,
      expiresAt: new Date("2090-01-01T00:00:00Z"), validatedAt: new Date(),
    });
    await migrator.db.insert(schema.postMedia).values({ id: media, postId: post, reservationId: reservation, attachmentOrder: 0 });
  });

  afterAll(async () => {
    try {
      await migrator.client`delete from public.profile_avatars where user_id = ${owner}`;
      await migrator.client`delete from public.post_media where post_id in (${post}, ${replacement}, ${accountPost}, ${sharedPost}, ${laterPost}, ${runtimePost})`;
      await migrator.client`delete from public.posts where id in (${post}, ${replacement}, ${accountPost}, ${sharedPost}, ${laterPost}, ${runtimePost})`;
      await migrator.client`delete from public.media_reservation where id in (${reservation}, ${sharedReservation}, ${runtimeReservation})`;
      await migrator.client`delete from public."user" where id in (${owner}, ${other})`;
    } finally {
      await Promise.all([migrator.close(), app.close(), worker.close()]);
    }
  });

  it("restricts grants and requires a live owner session", async () => {
    const grants = await migrator.client`select
      has_function_privilege('lifecycle_worker', 'public.claim_post_trash_cleanup(integer,text,integer)', 'EXECUTE') as worker_claim,
      has_function_privilege('app', 'public.claim_post_trash_cleanup(integer,text,integer)', 'EXECUTE') as app_claim,
      has_function_privilege('lifecycle_worker', 'public.report_post_trash_cleanup()', 'EXECUTE') as worker_report,
      has_function_privilege('app', 'public.report_post_trash_cleanup()', 'EXECUTE') as app_report,
      has_table_privilege('app', 'public.posts', 'DELETE') as app_delete,
      has_table_privilege('lifecycle_worker', 'public.posts', 'DELETE') as worker_delete`;
    expect(grants[0]).toMatchObject({ worker_claim: true, app_claim: false, worker_report: true,
      app_report: false, app_delete: false, worker_delete: false });
    expect(await cleanup.report()).toMatchObject({ due: 0, failed: 0, leased: 0 });
    await expect(app.db.update(schema.posts).set({ trashedAt: new Date() }).where(sql`${schema.posts.id} = ${post}`))
      .rejects.toThrow();
    const outsider = await postRepo.transition({ userId: other, sessionId: otherSession, postId: post, action: "trash" });
    expect(outsider.outcome).toBe("not_found");
    const invalid = await postRepo.transition({ userId: owner, sessionId: otherSession, postId: post, action: "trash" });
    expect(invalid.outcome).toBe("invalid_session");
  });

  it("uses post-lock database time and conflicts with an active same-day replacement", async () => {
    let lockEntered!: () => void;
    let releaseLock!: () => void;
    const locked = new Promise<void>((resolve) => { lockEntered = resolve; });
    const release = new Promise<void>((resolve) => { releaseLock = resolve; });
    const first = migrator.db.transaction(async (tx) => {
      await tx.select({ id: schema.user.id }).from(schema.user).where(sql`${schema.user.id} = ${owner}`).for("update");
      lockEntered();
      await release;
    });
    await locked;
    const pending = postRepo.transition({ userId: owner, sessionId: session, postId: post, action: "trash" });
    await new Promise((resolve) => setTimeout(resolve, 150));
    const releasedAt = Date.now();
    releaseLock();
    await first;
    const trashed = await pending;
    expect(trashed.outcome).toBe("trashed");
    expect(trashed.status!.trashedAt.getTime()).toBeGreaterThanOrEqual(releasedAt - 50);
    expect(trashed.status!.restoreUntil.getTime() - trashed.status!.trashedAt.getTime()).toBe(168 * 3600_000);
    expect(trashed.status!.purgeDueAt.getTime() - trashed.status!.trashedAt.getTime()).toBe(336 * 3600_000);
    expect((await postRepo.list(owner)).map((entry) => entry.id)).toContain(post);
    expect(await postRepo.list(other)).toEqual([]);
    expect((await postRepo.transition({ userId: owner, sessionId: session, postId: post, action: "trash" })).status?.restoreUntil)
      .toEqual(trashed.status!.restoreUntil);
    await createPost(replacement);
    expect((await postRepo.transition({ userId: owner, sessionId: session, postId: post, action: "restore" })).outcome)
      .toBe("day_occupied");
    await migrator.client`delete from public.posts where id = ${replacement}`;
    expect((await postRepo.transition({ userId: owner, sessionId: session, postId: post, action: "restore" })).outcome)
      .toBe("restored");
  });

  it("tombstones reservations before revealing R2 keys, then fences avatars and stale leases", async () => {
    expect((await postRepo.transition({ userId: owner, sessionId: session, postId: post, action: "trash" })).outcome)
      .toBe("trashed");
    await migrator.client`update public.posts set trashed_at = '2025-09-01T00:00:00Z',
      restore_until = '2025-09-08T00:00:00Z', trash_purge_due_at = '2025-09-15T00:00:00Z'
      where id = ${post}`;
    const [current] = await migrator.client`select trash_generation from public.posts where id = ${post}`;
    expect(await cleanup.complete({ postId: post, generation: Number(current?.trash_generation),
      leaseToken: null as unknown as string })).toBe("fenced");
    const holder = createDayliDatabase(fixtureUrl(migratorUrl!));
    const observer = createDayliDatabase(fixtureUrl(migratorUrl!));
    let entered!: () => void;
    let release!: () => void;
    const rowLocked = new Promise<void>((resolve) => { entered = resolve; });
    const unlock = new Promise<void>((resolve) => { release = resolve; });
    let job: Awaited<ReturnType<typeof cleanup.claim>>[number] | undefined;
    try {
      const hold = holder.db.transaction(async (tx) => {
        await tx.select({ id: schema.mediaReservation.id }).from(schema.mediaReservation)
          .where(sql`${schema.mediaReservation.id} = ${reservation}`).for("update");
        entered();
        await unlock;
      });
      await rowLocked;
      const pendingClaim = cleanup.claim(1, id("lease"), 60);
      let workerWaiting = false;
      for (let attempt = 0; attempt < 40; attempt += 1) {
        const [blocking] = await observer.client`
          select exists(select 1 from pg_stat_activity activity
            where activity.datname = current_database()
              and activity.usename = 'lifecycle_worker'
              and cardinality(pg_blocking_pids(activity.pid)) > 0) as waiting`;
        if (blocking?.waiting) { workerWaiting = true; break; }
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
      expect(workerWaiting).toBe(true);
      const pendingAvatar = createPostgresSetAvatarRepository(app.db).setAvatar(owner, reservation, new Date());
      release();
      await hold;
      [job] = await pendingClaim;
      await expect(pendingAvatar).resolves.toMatchObject({ kind: "notReady" });
    } finally {
      release();
      await Promise.all([holder.close(), observer.close()]);
    }
    expect(job?.objectKeys).toEqual([`media/${owner}/${media}`]);
    const [claimed] = await migrator.client`select cleanup_claimed_at from public.media_reservation where id = ${reservation}`;
    expect(claimed?.cleanup_claimed_at).not.toBeNull();
    await expect(createPostgresSetAvatarRepository(app.db).setAvatar(owner, reservation, new Date()))
      .resolves.toMatchObject({ kind: "notReady" });
    await expect(app.client`insert into public.profile_avatars (user_id, reservation_id)
      values (${owner}, ${reservation})`).rejects.toThrow();
    expect(await cleanup.complete({ ...job!, leaseToken: id("wrong") })).toBe("fenced");
    await migrator.client`update public.posts set trash_lease_expires_at = clock_timestamp() - interval '1 second'
      where id = ${post}`;
    expect(await cleanup.complete(job!)).toBe("fenced");
    expect(await cleanup.reschedule(job!, 10)).toBe(false);
    const [reclaimed] = await cleanup.claim(1, id("new-lease"), 60);
    expect(reclaimed?.leaseToken).toBe(id("new-lease"));
    expect(await cleanup.complete(job!)).toBe("fenced");
    expect(await cleanup.complete(reclaimed!)).toBe("deleted");
    const [remaining] = await migrator.client`select count(*)::int as count from public.media_reservation where id = ${reservation}`;
    expect(remaining?.count).toBe(0);
  });

  it("fails closed for shared avatar references and unsupported legacy media", async () => {
    await createPost(sharedPost);
    await migrator.client`insert into public.media_reservation
      (id, owner_id, object_key, content_type, byte_size, status, validated_at, expires_at)
      values (${sharedReservation}, ${owner}, ${`media/${owner}/shared`}, 'image/jpeg', 1024,
        'validated', clock_timestamp(), '2090-01-01T00:00:00Z')`;
    await migrator.client`insert into public.post_media (id, post_id, reservation_id, attachment_order)
      values (${id("shared-media")}, ${sharedPost}, ${sharedReservation}, 0)`;
    await migrator.client`insert into public.profile_avatars (user_id, reservation_id)
      values (${owner}, ${sharedReservation})`;
    expect((await postRepo.transition({ userId: owner, sessionId: session,
      postId: sharedPost, action: "trash" })).outcome).toBe("trashed");
    await migrator.client`update public.posts set trashed_at = '2025-09-01T00:00:00Z',
      restore_until = '2025-09-08T00:00:00Z', trash_purge_due_at = '2025-09-15T00:00:00Z'
      where id = ${sharedPost}`;
    // The oldest terminal candidate must not starve a later healthy post.
    await createPost(laterPost);
    expect((await postRepo.transition({ userId: owner, sessionId: session,
      postId: laterPost, action: "trash" })).outcome).toBe("trashed");
    await migrator.client`update public.posts set trashed_at = '2025-09-01T01:00:00Z',
      restore_until = '2025-09-08T01:00:00Z', trash_purge_due_at = '2025-09-15T01:00:00Z'
      where id = ${laterPost}`;
    expect(await cleanup.claim(1, id("shared-lease"), 60)).toEqual([]);
    const [blocked] = await migrator.client`select trash_failure_category, trash_next_attempt_at::text as retry_at
      from public.posts where id = ${sharedPost}`;
    expect(blocked).toMatchObject({ trash_failure_category: "shared_media", retry_at: "infinity" });
    const [laterJob] = await cleanup.claim(1, id("later-lease"), 60);
    expect(laterJob?.postId).toBe(laterPost);
    expect(await cleanup.complete(laterJob!)).toBe("deleted");
    await migrator.client`delete from public.profile_avatars where user_id = ${owner}`;
    // Synthetic migrator cleanup simulates a separately reviewed operator fix.
    await migrator.client`update public.posts set trash_failure_category = null,
      trash_next_attempt_at = null where id = ${sharedPost}`;
    await migrator.client`insert into public.post_media (id, post_id, attachment_order)
      values (${id("legacy-media")}, ${sharedPost}, 1)`;
    expect(await cleanup.claim(1, id("legacy-lease"), 60)).toEqual([]);
    const [unsupported] = await migrator.client`select trash_failure_category from public.posts where id = ${sharedPost}`;
    expect(unsupported?.trash_failure_category).toBe("unsupported_media");
    await migrator.client`delete from public.post_media where id = ${id("legacy-media")}`;
    await migrator.client`update public.posts set trash_failure_category = null,
      trash_next_attempt_at = null where id = ${sharedPost}`;
    const [recovered] = await cleanup.claim(1, id("recovered-lease"), 60);
    expect(recovered?.postId).toBe(sharedPost);
    expect(await cleanup.complete(recovered!)).toBe("deleted");
  });

  it("executes the scheduled runtime through the restricted role and deletes actual loopback object bytes", async () => {
    const objectKey = `media/${owner}/${runtimeMedia}`;
    const objects = new Map([[`/trash-runtime/${objectKey}`, Buffer.from("synthetic-trash-object")]]);
    const server = createServer((request, response) => {
      if (request.method !== "DELETE" || !request.headers.authorization) {
        response.writeHead(403).end();
        return;
      }
      if (!objects.delete(request.url ?? "")) {
        response.writeHead(404).end();
        return;
      }
      response.writeHead(204).end();
    });
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Loopback object store did not bind a port.");
    try {
      await migrator.db.insert(schema.posts).values({
        id: runtimePost, authorId: owner, localDate: "2026-10-03", promptId: "prompt-10-03",
        reflectiveAnswer: "Runtime object fixture", rating: 6, audience: "friends",
        acceptedAt: new Date("2026-10-03T01:00:00Z"), releasedAt: new Date("2026-10-03T12:00:00Z"),
      });
      await migrator.db.insert(schema.mediaReservation).values({
        id: runtimeReservation, ownerId: owner, objectKey, status: "validated",
        contentType: "image/jpeg", byteSize: objects.values().next().value!.byteLength,
        expiresAt: new Date("2090-01-01T00:00:00Z"), validatedAt: new Date(),
      });
      await migrator.db.insert(schema.postMedia).values({
        id: runtimeMedia, postId: runtimePost, reservationId: runtimeReservation, attachmentOrder: 0,
      });
      expect((await postRepo.transition({ userId: owner, sessionId: session,
        postId: runtimePost, action: "trash" })).outcome).toBe("trashed");
      expect((await postRepo.list(owner)).map((entry) => entry.id)).toContain(runtimePost);
      await migrator.client`update public.posts set trashed_at = '2025-09-01T00:00:00Z',
        restore_until = '2025-09-08T00:00:00Z', trash_purge_due_at = '2025-09-15T00:00:00Z'
        where id = ${runtimePost}`;

      const runtimeEnvironment = {
        HYPERDRIVE: { connectionString: fixtureUrl(appUrl!) },
        EXPORT_WORKER_HYPERDRIVE: { connectionString: fixtureUrl(workerUrl!) },
        BETTER_AUTH_SECRET: "unused-runtime-proof-secret",
        BETTER_AUTH_BASE_URL: "https://local.invalid",
        BETTER_AUTH_TRUSTED_ORIGINS: "https://local.invalid",
        R2_ACCOUNT_ID: "local-e2e",
        R2_BUCKET_NAME: "trash-runtime",
        R2_ACCESS_KEY_ID: "local-access",
        R2_SECRET_ACCESS_KEY: "local-secret",
        R2_LOCAL_ENDPOINT: `http://127.0.0.1:${address.port}`,
      };
      const appRoleWorkerUrl = new URL(fixtureUrl(appUrl!));
      appRoleWorkerUrl.searchParams.set("application_name", "distinct-binding-same-role");
      const wrongRoleEnvironment = {
        ...runtimeEnvironment,
        EXPORT_WORKER_HYPERDRIVE: { connectionString: appRoleWorkerUrl.href },
      };
      await expect(provePostTrashCleanupAdmission(wrongRoleEnvironment)).resolves.toEqual({
        structuralDependencies: true,
        connectionStringNamesLifecycleWorker: false,
        authoritativeWorkerRole: false,
        runtimeAdmitted: false,
      });
      expect(await runPostTrashCleanupForEnv(wrongRoleEnvironment)).toBeNull();
      expect(objects.size).toBe(1);
      await expect(provePostTrashCleanupAdmission(runtimeEnvironment)).resolves.toEqual({
        structuralDependencies: true,
        connectionStringNamesLifecycleWorker: true,
        authoritativeWorkerRole: true,
        runtimeAdmitted: true,
      });

      const summary = await runPostTrashCleanupForEnv(runtimeEnvironment);
      expect(summary).toMatchObject({ claimed: 1, deleted: 1, rescheduled: 0, failed: 0, fenced: 0 });
      expect(objects.size).toBe(0);
      const [remaining] = await migrator.client`select
        (select count(*)::int from public.posts where id = ${runtimePost}) as posts,
        (select count(*)::int from public.media_reservation where id = ${runtimeReservation}) as reservations`;
      expect(remaining).toMatchObject({ posts: 0, reservations: 0 });
    } finally {
      server.close();
      await once(server, "close");
    }
  });

  it("fences post cleanup and restore when account deletion becomes pending", async () => {
    const remainingPost = accountPost;
    await createPost(remainingPost);
    expect((await postRepo.transition({ userId: owner, sessionId: session,
      postId: remainingPost, action: "trash" })).outcome).toBe("trashed");
    await migrator.client`update public.posts set trashed_at = '2025-09-01T00:00:00Z',
      restore_until = '2025-09-08T00:00:00Z', trash_purge_due_at = '2025-09-15T00:00:00Z'
      where id = ${remainingPost}`;
    expect((await postRepo.transition({ userId: owner, sessionId: session,
      postId: remainingPost, action: "restore" })).outcome).toBe("expired");
    const [job] = await cleanup.claim(1, id("account-lease"), 60);
    expect(job?.postId).toBe(remainingPost);
    await migrator.client`insert into public.account_lifecycles
      (user_id, state, request_id, idempotency_key_digest, requested_at, cancel_until, purge_due_at)
      values (${owner}, 'pending_deletion', ${id("deletion")}, ${"a".repeat(64)},
        '2025-09-01T00:00:00Z', '2025-09-08T00:00:00Z', '2025-09-15T00:00:00Z')`;
    expect(await cleanup.complete(job!)).toBe("fenced");
    expect(await cleanup.reschedule(job!, 10)).toBe(false);
    expect(await cleanup.claim(1, id("blocked-lease"), 60)).toEqual([]);
    expect((await postRepo.transition({ userId: owner, sessionId: session,
      postId: remainingPost, action: "restore" })).outcome).toBe("restricted");
  });
});
