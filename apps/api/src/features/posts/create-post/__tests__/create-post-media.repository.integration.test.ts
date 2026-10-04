import { createDayliDatabase, schema } from "@dayli/db";
import { asc, count, eq, inArray } from "drizzle-orm";
import { createAucklandDayService } from "@dayli/domain";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPostgresDailyPostStore } from "../create-post.repository";
import { createDailyPostService, type CreateDailyPostInput } from "../create-post.service";

const migratorUrl = process.env.TEST_DATABASE_URL;
const appUrl = process.env.TEST_APP_DATABASE_URL;
const enabled = Boolean(migratorUrl && appUrl && process.env.POSTS_POSTGRES_TEST === "1");
const testPostgresPort = process.env.VERIFY_POSTGRES_PORT ?? "5433";

function requireLocalTestUrl(value: string): string {
  const url = new URL(value);
  if (url.hostname !== "localhost" || url.port !== testPostgresPort || url.pathname !== "/dayli_test") {
    throw new Error(`Post media tests must target localhost:${testPostgresPort}/dayli_test.`);
  }
  return value;
}

/**
 * Linking runs through the restricted app role, as the Worker does. Fixtures
 * are unique per run and removed by the migrator, which alone may delete
 * post_media rows.
 */
(enabled ? describe : describe.skip)("PostgreSQL post media linking", () => {
  const migrator = createDayliDatabase(requireLocalTestUrl(migratorUrl ?? "postgresql://localhost:5433/dayli_test"));
  const app = createDayliDatabase(requireLocalTestUrl(appUrl ?? "postgresql://localhost:5433/dayli_test"));
  const users = Array.from({ length: 6 }, (_, index) => `post-media-${crypto.randomUUID()}-${index}`);
  const now = new Date("2026-09-25T03:00:00.000Z");
  const clock = () => now;
  const input: CreateDailyPostInput = {
    localDate: "2026-09-25",
    promptId: "prompt-09-25",
    reflectiveAnswer: "Walked to the harbour.",
    rating: 7,
    audience: "friends",
  };

  function service(database = app) {
    return createDailyPostService({
      store: createPostgresDailyPostStore(database.db),
      clock,
      dayService: createAucklandDayService(clock),
    });
  }

  async function upload(ownerId: string, overrides: Partial<typeof schema.mediaReservation.$inferInsert> = {}) {
    const id = `reservation-${crypto.randomUUID()}`;
    const status = overrides.status ?? "validated";
    await migrator.db.insert(schema.mediaReservation).values({
      id,
      ownerId,
      objectKey: `media/${ownerId}/${id}`,
      contentType: "image/jpeg",
      byteSize: 1000,
      status,
      validatedAt: status === "pending" ? null : now,
      failureReason: status === "failed" ? "format_mismatch" : null,
      expiresAt: new Date("2026-09-25T03:15:00.000Z"),
      ...overrides,
    });
    return id;
  }

  async function countRows(authorId: string) {
    const [posts] = await migrator.db.select({ count: count() })
      .from(schema.posts)
      .where(eq(schema.posts.authorId, authorId));
    const [media] = await migrator.db.select({ count: count() })
      .from(schema.postMedia)
      .innerJoin(schema.posts, eq(schema.posts.id, schema.postMedia.postId))
      .where(eq(schema.posts.authorId, authorId));
    return { posts: posts?.count, media: media?.count };
  }

  beforeAll(async () => {
    await migrator.db.insert(schema.user).values(users.map((id) => ({
      id,
      name: id,
      email: `${id}@example.test`,
    })));
  });

  afterAll(async () => {
    try {
      const posts = migrator.db.select({ id: schema.posts.id }).from(schema.posts).where(inArray(schema.posts.authorId, users));
      // post_media first: RESTRICT keeps a linked reservation until its link is gone.
      await migrator.db.delete(schema.postMedia).where(inArray(schema.postMedia.postId, posts));
      await migrator.db.delete(schema.posts).where(inArray(schema.posts.authorId, users));
      await migrator.db.delete(schema.mediaReservation).where(inArray(schema.mediaReservation.ownerId, users));
      await migrator.db.delete(schema.user).where(inArray(schema.user.id, users));
    } finally {
      await Promise.all([app.close(), migrator.close()]);
    }
  });

  it("links validated uploads in order and replays them", async () => {
    const photoA = await upload(users[0]!);
    const photoB = await upload(users[0]!, { contentType: "image/png" });
    const created = await service().createDailyPost(users[0]!, "key-1", { ...input, attachments: [photoB, photoA] });
    const replayed = await service().createDailyPost(users[0]!, "key-1", { ...input, attachments: [photoB, photoA] });

    expect(created.post.media.map((media) => [media.contentType, media.order])).toEqual([["image/png", 0], ["image/jpeg", 1]]);
    expect(replayed).toEqual({ post: created.post, replayed: true });

    const rows = await migrator.db
      .select({ reservationId: schema.postMedia.reservationId, order: schema.postMedia.attachmentOrder })
      .from(schema.postMedia)
      .where(eq(schema.postMedia.postId, created.post.id))
      .orderBy(asc(schema.postMedia.attachmentOrder));
    expect(rows).toEqual([{ reservationId: photoB, order: 0 }, { reservationId: photoA, order: 1 }]);
  });

  it("stops a linked upload being deleted or attached again", async () => {
    const [link] = await migrator.db
      .select({ id: schema.postMedia.id, postId: schema.postMedia.postId, reservationId: schema.postMedia.reservationId })
      .from(schema.postMedia)
      .innerJoin(schema.posts, eq(schema.posts.id, schema.postMedia.postId))
      .where(eq(schema.posts.authorId, users[0]!))
      .limit(1);
    expect(link?.reservationId).toBeTruthy();

    await expect(migrator.db.delete(schema.mediaReservation)
      .where(eq(schema.mediaReservation.id, link!.reservationId!))).rejects.toThrow();
    await expect(migrator.db.insert(schema.postMedia).values({
      id: `media-${crypto.randomUUID()}`,
      postId: link!.postId,
      attachmentOrder: 9,
      reservationId: link!.reservationId,
    })).rejects.toThrow();
  });

  it("writes nothing when an upload isn't ready", async () => {
    const pending = await upload(users[1]!, { status: "pending" });
    await expect(service().createDailyPost(users[1]!, "key-1", { ...input, attachments: [pending] }))
      .rejects.toMatchObject({ reason: "MEDIA_NOT_READY" });
    expect(await countRows(users[1]!)).toEqual({ posts: 0, media: 0 });
  });

  it("treats another user's upload as unavailable", async () => {
    const theirs = await upload(users[3]!);
    await expect(service().createDailyPost(users[2]!, "key-1", { ...input, attachments: [theirs] }))
      .rejects.toMatchObject({ reason: "MEDIA_UNAVAILABLE" });
    expect(await countRows(users[2]!)).toEqual({ posts: 0, media: 0 });
  });

  it("waits for a concurrent writer holding the reservation row", async () => {
    const photo = await upload(users[2]!);
    let release!: () => void;
    const held = new Promise<void>((resolve) => { release = resolve; });
    let locked!: () => void;
    const lockTaken = new Promise<void>((resolve) => { locked = resolve; });

    // Stands in for reservation cleanup, which must lock the row before deleting it.
    const writer = migrator.db.transaction(async (tx) => {
      await tx.select({ id: schema.mediaReservation.id })
        .from(schema.mediaReservation)
        .where(eq(schema.mediaReservation.id, photo))
        .for("update");
      locked();
      await held;
    });
    await lockTaken;

    let settled = false;
    const submission = service().createDailyPost(users[2]!, "key-2", { ...input, attachments: [photo] })
      .finally(() => { settled = true; });
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(settled).toBe(false);

    release();
    await writer;
    await expect(submission).resolves.toMatchObject({ post: { media: [{ contentType: "image/jpeg" }] } });
  });
  it("links a voice memo after the photos and refuses another user's voice memo", async () => {
    const memo = await upload(users[4]!, { contentType: "audio/mp4", byteSize: 500_000 });
    const photo = await upload(users[4]!);
    const created = await service().createDailyPost(users[4]!, "key-1", { ...input, attachments: [memo, photo] });

    expect(created.post.media.map((media) => [media.contentType, media.order])).toEqual([
      ["image/jpeg", 0],
      ["audio/mp4", 1],
    ]);

    const theirs = await upload(users[4]!, { contentType: "audio/mp4" });
    await expect(service().createDailyPost(users[5]!, "key-1", { ...input, attachments: [theirs] }))
      .rejects.toMatchObject({ reason: "MEDIA_UNAVAILABLE" });
    expect(await countRows(users[5]!)).toEqual({ posts: 0, media: 0 });

    const second = await upload(users[5]!, { contentType: "audio/mp4" });
    const third = await upload(users[5]!, { contentType: "audio/mp4" });
    await expect(service().createDailyPost(users[5]!, "key-2", { ...input, attachments: [second, third] }))
      .rejects.toMatchObject({ reason: "MEDIA_NOT_ALLOWED" });
    expect(await countRows(users[5]!)).toEqual({ posts: 0, media: 0 });
  });
});
