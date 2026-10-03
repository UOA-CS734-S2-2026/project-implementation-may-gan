import { createDayliDatabase, schema } from "@dayli/db";
import { inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readAttachedMedia } from "../shared/post-media";
import { createPostgresPostMediaRepository } from "./get-post-media.repository";

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
 * Media reads run through the restricted app role against the real visibility
 * predicate. Fixtures are unique per run; the migrator alone deletes post_media.
 */
(enabled ? describe : describe.skip)("PostgreSQL post media authorisation", () => {
  const migrator = createDayliDatabase(requireLocalTestUrl(migratorUrl ?? "postgresql://localhost:5433/dayli_test"));
  const app = createDayliDatabase(requireLocalTestUrl(appUrl ?? "postgresql://localhost:5433/dayli_test"));
  const run = crypto.randomUUID().replaceAll("-", "").slice(0, 10);
  const id = (name: string) => `pm-${run}-${name}`;
  const users = {
    author: id("author"),
    friend: id("friend"),
    stranger: id("stranger"),
    blocked: id("blocked"),
  };
  const userIds = Object.values(users);
  const now = new Date("2026-09-26T03:00:00.000Z");
  const media = () => createPostgresPostMediaRepository(app.db);

  async function insertPost(key: string, localDate: string, audience: "solo" | "friends", released: boolean) {
    await migrator.db.insert(schema.posts).values({
      id: id(key),
      authorId: users.author,
      localDate,
      promptId: `prompt-${localDate.slice(5)}`,
      reflectiveAnswer: `Answer ${key}`,
      rating: 8,
      audience,
      acceptedAt: new Date(`${localDate}T03:00:00.000Z`),
      releasedAt: new Date(released ? `${localDate}T12:00:00.000Z` : "2026-09-26T12:00:00.000Z"),
    });
  }

  async function attach(
    key: string,
    post: string,
    order: number,
    options: { detached?: boolean; legacy?: boolean; contentType?: string } = {},
  ) {
    let reservationId: string | null = null;
    if (!options.legacy) {
      reservationId = id(`reservation-${key}`);
      await migrator.db.insert(schema.mediaReservation).values({
        id: reservationId,
        ownerId: users.author,
        objectKey: `media/${users.author}/${reservationId}`,
        contentType: options.contentType ?? "image/jpeg",
        byteSize: 1000,
        status: "validated",
        validatedAt: now,
        expiresAt: now,
      });
    }
    await migrator.db.insert(schema.postMedia).values({
      id: id(key),
      postId: id(post),
      attachmentOrder: order,
      reservationId,
      detachedAt: options.detached ? now : null,
    });
  }

  beforeAll(async () => {
    for (const [key, userId] of Object.entries(users)) {
      await migrator.db.insert(schema.user).values({
        id: userId,
        name: key,
        email: `${userId}@example.test`,
        username: `p${run}${key}`.slice(0, 30),
        profileVisibility: key === "author" ? "public" : "private",
      });
    }
    for (const other of [users.friend, users.blocked]) {
      await migrator.db.insert(schema.friendships).values([
        { userId: users.author, friendId: other, state: "active", stateChangedAt: now },
        { userId: other, friendId: users.author, state: "active", stateChangedAt: now },
      ]);
    }
    await migrator.db.insert(schema.relationshipBlocks).values({
      blockerId: users.author,
      blockedId: users.blocked,
      blockedAt: now,
    });

    await insertPost("released", "2026-09-24", "friends", true);
    await insertPost("solo", "2026-09-23", "solo", true);
    await insertPost("unreleased", "2026-09-26", "friends", false);
    // Inserted out of order to prove reads follow attachment_order.
    await attach("second", "released", 1);
    await attach("first", "released", 0);
    await attach("removed", "released", 5, { detached: true });
    await attach("legacy", "released", 2, { legacy: true });
    await attach("memo", "released", 3, { contentType: "audio/mp4" });
    await attach("solo-photo", "solo", 0);
    await attach("unreleased-photo", "unreleased", 0);
  });

  afterAll(async () => {
    try {
      const posts = migrator.db.select({ id: schema.posts.id }).from(schema.posts).where(inArray(schema.posts.authorId, userIds));
      await migrator.db.delete(schema.postMedia).where(inArray(schema.postMedia.postId, posts));
      await migrator.db.delete(schema.posts).where(inArray(schema.posts.authorId, userIds));
      await migrator.db.delete(schema.mediaReservation).where(inArray(schema.mediaReservation.ownerId, userIds));
      await migrator.db.delete(schema.relationshipBlocks).where(inArray(schema.relationshipBlocks.blockerId, userIds));
      await migrator.db.delete(schema.friendships).where(inArray(schema.friendships.userId, userIds));
      await migrator.db.delete(schema.user).where(inArray(schema.user.id, userIds));
    } finally {
      await Promise.all([app.close(), migrator.close()]);
    }
  });

  it("gives an active friend a released post's attached media, with its object", async () => {
    await expect(media().findMedia(users.friend, id("released"), id("first"), now)).resolves.toEqual({
      id: id("first"),
      postId: id("released"),
      contentType: "image/jpeg",
      order: 0,
      objectKey: `media/${users.author}/${id("reservation-first")}`,
    });
  });

  it("refuses everyone the post itself would refuse", async () => {
    const denied: Array<[string, string | null, string, string]> = [
      ["stranger", users.stranger, "released", "first"],
      ["blocked friend", users.blocked, "released", "first"],
      ["anonymous", null, "released", "first"],
      ["friend, solo post", users.friend, "solo", "solo-photo"],
      ["friend, unreleased post", users.friend, "unreleased", "unreleased-photo"],
    ];
    for (const [label, viewer, post, item] of denied) {
      await expect(media().findMedia(viewer, id(post), id(item), now), label).resolves.toBeNull();
    }
  });

  it("allows public-only readers only through parent-authorized delivery and withdraws on privacy change", async () => {
    await expect(media().findMedia(null, id("released"), id("first"), now, "parent-authorized")).resolves.not.toBeNull();
    await expect(media().findMedia(users.stranger, id("released"), id("first"), now, "parent-authorized")).resolves.not.toBeNull();
    await expect(media().findMedia(users.blocked, id("released"), id("first"), now, "parent-authorized")).resolves.toBeNull();

    await migrator.db.update(schema.user).set({ profileVisibility: "private" }).where(inArray(schema.user.id, [users.author]));
    try {
      await expect(media().findMedia(null, id("released"), id("first"), now, "parent-authorized")).resolves.toBeNull();
    } finally {
      await migrator.db.update(schema.user).set({ profileVisibility: "public" }).where(inArray(schema.user.id, [users.author]));
    }
  });

  it("refuses detached, legacy, and mismatched media even on a readable post", async () => {
    await expect(media().findMedia(users.friend, id("released"), id("removed"), now)).resolves.toBeNull();
    await expect(media().findMedia(users.friend, id("released"), id("legacy"), now)).resolves.toBeNull();
    // A readable post can't be used to reach another post's media.
    await expect(media().findMedia(users.friend, id("released"), id("solo-photo"), now)).resolves.toBeNull();
  });

  it("never serves a voice memo through the photo and video route", async () => {
    // Recordings are read through their own route.
    await expect(media().findMedia(users.friend, id("released"), id("memo"), now)).resolves.toBeNull();
    await expect(media().findMedia(users.author, id("released"), id("memo"), now)).resolves.toBeNull();
  });

  it("lets the author reach their own solo and unreleased media", async () => {
    await expect(media().findMedia(users.author, id("solo"), id("solo-photo"), now)).resolves.not.toBeNull();
    await expect(media().findMedia(users.author, id("unreleased"), id("unreleased-photo"), now)).resolves.not.toBeNull();
  });

  it("lists only attached, uploaded media for each post, in order", async () => {
    const byPost = await readAttachedMedia(app.db, [id("released"), id("solo")]);
    expect(byPost.get(id("released"))?.map((item) => [item.id, item.order])).toEqual([[id("first"), 0], [id("second"), 1]]);
    expect(byPost.get(id("solo"))?.map((item) => item.id)).toEqual([id("solo-photo")]);
  });
});
