import { createDayliDatabase, schema } from "@dayli/db";
import { and, eq, inArray, isNotNull, notInArray } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createPostgresMediaCleanupStore } from "./media-cleanup-store";

const migratorUrl = process.env.TEST_DATABASE_URL;
const appUrl = process.env.TEST_APP_DATABASE_URL;
const enabled = Boolean(migratorUrl && appUrl && process.env.POSTS_POSTGRES_TEST === "1");
const testPostgresPort = process.env.VERIFY_POSTGRES_PORT ?? "5433";

function requireLocalTestUrl(value: string): string {
  const url = new URL(value);
  if (url.hostname !== "localhost" || url.port !== testPostgresPort || url.pathname !== "/dayli_test") {
    throw new Error(`Media cleanup tests must target localhost:${testPostgresPort}/dayli_test.`);
  }
  return value;
}

const hour = 60 * 60 * 1000;
const graceMs = 24 * hour;
// Far in the past, so only these fixtures qualify and leftovers from other suites in
// the shared test database are never claimed.
const now = new Date("2020-06-01T00:00:00.000Z");
const longAgo = new Date(now.getTime() - graceMs - hour);

/** Runs through the restricted app role, as the scheduled Worker does. */
(enabled ? describe : describe.skip)("PostgreSQL media cleanup store", () => {
  const migrator = createDayliDatabase(requireLocalTestUrl(migratorUrl ?? "postgresql://localhost:5433/dayli_test"));
  const app = createDayliDatabase(requireLocalTestUrl(appUrl ?? "postgresql://localhost:5433/dayli_test"));
  const second = createDayliDatabase(requireLocalTestUrl(appUrl ?? "postgresql://localhost:5433/dayli_test"));
  const owner = `media-cleanup-${crypto.randomUUID()}`;
  const created: string[] = [];
  let tokens = 0;
  let posted = 0;
  const leaseToken = () => `token-${tokens++}`;
  const store = createPostgresMediaCleanupStore(app.db);
  const claim = (overrides: Partial<Parameters<typeof store.claimDue>[0]> = {}, target = store) =>
    target.claimDue({ now, limit: 50, leaseForMs: 60_000, graceMs, maxAttempts: 3, leaseToken, ...overrides });

  async function upload(overrides: Partial<typeof schema.mediaReservation.$inferInsert> = {}) {
    const id = `reservation-${crypto.randomUUID()}`;
    const status = overrides.status ?? "validated";
    await migrator.db.insert(schema.mediaReservation).values({
      id,
      ownerId: owner,
      objectKey: `media/${owner}/${id}`,
      contentType: "image/jpeg",
      byteSize: 1000,
      status,
      validatedAt: status === "pending" ? null : longAgo,
      failureReason: status === "failed" ? "format_mismatch" : null,
      createdAt: longAgo,
      expiresAt: longAgo,
      ...overrides,
    });
    created.push(id);
    return id;
  }

  async function row(id: string) {
    const [found] = await migrator.db.select().from(schema.mediaReservation).where(eq(schema.mediaReservation.id, id));
    return found;
  }

  async function attach(reservationId: string, detached = false) {
    const postId = `post-${crypto.randomUUID()}`;
    await migrator.db.insert(schema.posts).values({
      id: postId, authorId: owner, localDate: `2026-01-${String(++posted).padStart(2, "0")}`,
      promptId: "prompt-01-01", reflectiveAnswer: "x", rating: 5, audience: "friends", acceptedAt: now, releasedAt: new Date(now.getTime() + hour),
    });
    await migrator.db.insert(schema.postMedia).values({
      id: `media-${crypto.randomUUID()}`, postId, attachmentOrder: 0, reservationId, detachedAt: detached ? now : null,
    });
    return postId;
  }

  beforeAll(async () => {
    await migrator.db.insert(schema.user).values({ id: owner, name: owner, email: `${owner}@example.test` });
  });

  // Each test starts from a table where only linked uploads remain.
  beforeEach(async () => {
    const linked = migrator.db.select({ id: schema.postMedia.reservationId }).from(schema.postMedia).where(isNotNull(schema.postMedia.reservationId));
    const avatars = migrator.db.select({ id: schema.profileAvatars.reservationId }).from(schema.profileAvatars);
    await migrator.db.delete(schema.mediaReservation).where(and(
      eq(schema.mediaReservation.ownerId, owner),
      notInArray(schema.mediaReservation.id, linked),
      notInArray(schema.mediaReservation.id, avatars),
    ));
  });

  afterAll(async () => {
    try {
      const posts = migrator.db.select({ id: schema.posts.id }).from(schema.posts).where(eq(schema.posts.authorId, owner));
      await migrator.db.delete(schema.postMedia).where(inArray(schema.postMedia.postId, posts));
      await migrator.db.delete(schema.posts).where(eq(schema.posts.authorId, owner));
      await migrator.db.delete(schema.profileAvatars).where(eq(schema.profileAvatars.userId, owner));
      await migrator.db.delete(schema.mediaReservation).where(eq(schema.mediaReservation.ownerId, owner));
      await migrator.db.delete(schema.user).where(eq(schema.user.id, owner));
    } finally {
      await Promise.all([app.close(), second.close(), migrator.close()]);
    }
  });

  it("claims abandoned uploads of every status and tombstones them", async () => {
    const ids = [await upload({ status: "pending" }), await upload({ status: "validated" }), await upload({ status: "failed" })];
    const claimed = await claim();
    expect(claimed.map((job) => job.id).sort()).toEqual([...ids].sort());
    for (const job of claimed) {
      expect(job.attempts).toBe(1);
      expect(job.objectKey).toBe(`media/${owner}/${job.id}`);
      expect(await row(job.id)).toMatchObject({ cleanupClaimedAt: now, cleanupLeaseToken: job.leaseToken });
    }
    await store.complete(claimed[0]!);
    await store.complete(claimed[1]!);
    await store.complete(claimed[2]!);
  });

  it("never claims uploads inside the grace period", async () => {
    const recent = await upload({ expiresAt: new Date(now.getTime() - graceMs + hour) });
    const live = await upload({ status: "pending", expiresAt: new Date(now.getTime() + 15 * 60_000) });
    expect(await claim()).toEqual([]);
    expect((await row(recent))?.cleanupClaimedAt).toBeNull();
    expect((await row(live))?.cleanupClaimedAt).toBeNull();
  });

  it("never claims or deletes an upload a post uses, attached or detached", async () => {
    const attached = await upload();
    const detached = await upload();
    await attach(attached);
    await attach(detached, true);
    expect(await claim()).toEqual([]);
    expect(await row(attached)).toBeDefined();
    expect(await row(detached)).toBeDefined();
  });

  it("never claims or deletes an upload still used as a profile avatar", async () => {
    const avatar = await upload();
    await migrator.db.insert(schema.profileAvatars).values({ userId: owner, reservationId: avatar, setAt: now });
    try {
      expect(await claim()).toEqual([]);
      expect(await row(avatar)).toBeDefined();
    } finally {
      await migrator.db.delete(schema.profileAvatars).where(eq(schema.profileAvatars.userId, owner));
    }
  });

  it("refuses to delete a row a post links after the claim", async () => {
    const id = await upload();
    const [job] = await claim();
    expect(job?.id).toBe(id);
    await attach(id);
    expect(await store.complete(job!)).toBe(false);
    expect(await row(id)).toBeDefined();
    // Even once its lease lapses, a linked upload is never handed out for deletion.
    expect(await claim({ now: new Date(now.getTime() + hour) })).toEqual([]);
  });

  it("gives two concurrent claimers disjoint uploads", async () => {
    await Promise.all(Array.from({ length: 6 }, () => upload()));
    const other = createPostgresMediaCleanupStore(second.db);
    const [a, b] = await Promise.all([claim({ limit: 4 }), claim({ limit: 4 }, other)]);
    const ids = [...a, ...b].map((job) => job.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.length).toBeGreaterThanOrEqual(6);
    for (const job of [...a, ...b]) await store.complete(job);
  });

  it("deletes only for the lease holder, and a reclaimed job fences the old holder", async () => {
    const id = await upload();
    const [first] = await claim();
    expect(first?.id).toBe(id);
    expect(await claim()).toEqual([]);

    const later = new Date(now.getTime() + 61_000);
    const [reclaimed] = await claim({ now: later });
    expect(reclaimed).toMatchObject({ id, attempts: 2 });
    expect(await store.complete(first!)).toBe(false);
    expect(await store.reschedule(first!, later)).toBe(false);
    expect(await store.complete(reclaimed!)).toBe(true);
    expect(await row(id)).toBeUndefined();
  });

  it("holds a failed job until its backoff and stops at the attempt cap", async () => {
    const id = await upload();
    const retryAt = new Date(now.getTime() + 10_000);
    const [first] = await claim();
    expect(await store.reschedule(first!, retryAt)).toBe(true);
    expect(await claim({ now: new Date(now.getTime() + 5_000) })).toEqual([]);

    const [second] = await claim({ now: retryAt });
    expect(second).toMatchObject({ id, attempts: 2 });
    await store.reschedule(second!, new Date(retryAt.getTime() + 1_000));
    const [third] = await claim({ now: new Date(retryAt.getTime() + 1_000) });
    expect(third?.attempts).toBe(3);
    // The dispatcher passes null on the last attempt, which clears the due time.
    await store.reschedule(third!, null);

    expect(await claim({ now: new Date(retryAt.getTime() + hour) })).toEqual([]);
    expect(await row(id)).toMatchObject({ cleanupAttempts: 3 });
    expect(await row(id)).toMatchObject({ cleanupLeaseExpiresAt: null, cleanupAvailableAt: null });
    expect((await row(id))?.cleanupClaimedAt).not.toBeNull();
  });
});
