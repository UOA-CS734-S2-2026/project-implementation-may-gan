import { createDayliDatabase, schema } from "@dayli/db";
import { and, eq, inArray, or } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readAttachedVoiceMemo, readAttachedMedia } from "../shared/post-media";
import { createPostgresPostVoiceMemoRepository } from "./get-post-voice-memo.repository";

const migratorUrl = process.env.TEST_DATABASE_URL;
const appUrl = process.env.TEST_APP_DATABASE_URL;
const enabled = Boolean(migratorUrl && appUrl && process.env.POSTS_POSTGRES_TEST === "1");
const testPostgresPort = process.env.VERIFY_POSTGRES_PORT ?? "5433";

function requireLocalTestUrl(value: string): string {
  const url = new URL(value);
  if (url.hostname !== "localhost" || url.port !== testPostgresPort || url.pathname !== "/dayli_test") {
    throw new Error(`Voice memo tests must target localhost:${testPostgresPort}/dayli_test.`);
  }
  return value;
}

/**
 * Recording reads run through the restricted app role against the real
 * visibility predicate. Fixtures are unique per run; the migrator alone deletes
 * post_media.
 */
(enabled ? describe : describe.skip)("PostgreSQL post voice memo authorisation", () => {
  const migrator = createDayliDatabase(requireLocalTestUrl(migratorUrl ?? "postgresql://localhost:5433/dayli_test"));
  const app = createDayliDatabase(requireLocalTestUrl(appUrl ?? "postgresql://localhost:5433/dayli_test"));
  const run = crypto.randomUUID().replaceAll("-", "").slice(0, 10);
  const id = (name: string) => `pa-${run}-${name}`;
  const users = {
    author: id("author"),
    friend: id("friend"),
    stranger: id("stranger"),
    blocked: id("blocked"),
    unfriended: id("unfriended"),
  };
  const userIds = Object.values(users);
  const now = new Date("2026-09-26T03:00:00.000Z");
  const voiceMemos = () => createPostgresPostVoiceMemoRepository(app.db);

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

  async function attach(key: string, post: string, order: number, contentType: string, detached = false) {
    const reservationId = id(`reservation-${key}`);
    await migrator.db.insert(schema.mediaReservation).values({
      id: reservationId,
      ownerId: users.author,
      objectKey: `media/${users.author}/${reservationId}`,
      contentType,
      byteSize: 1000,
      status: "validated",
      validatedAt: now,
      expiresAt: now,
    });
    await migrator.db.insert(schema.postMedia).values({
      id: id(key),
      postId: id(post),
      attachmentOrder: order,
      reservationId,
      detachedAt: detached ? now : null,
    });
  }

  beforeAll(async () => {
    for (const [key, userId] of Object.entries(users)) {
      await migrator.db.insert(schema.user).values({
        id: userId,
        name: key,
        email: `${userId}@example.test`,
        username: `a${run}${key}`.slice(0, 30),
      });
    }
    for (const other of [users.friend, users.blocked, users.unfriended]) {
      await migrator.db.insert(schema.friendships).values([
        { userId: users.author, friendId: other, state: "active", stateChangedAt: now },
        { userId: other, friendId: users.author, state: "active", stateChangedAt: now },
      ]);
    }

    await insertPost("released", "2026-09-24", "friends", true);
    await insertPost("solo", "2026-09-23", "solo", true);
    await insertPost("unreleased", "2026-09-26", "friends", false);
    await insertPost("detached", "2026-09-22", "friends", true);
    await insertPost("plain", "2026-09-21", "friends", true);
    await attach("photo", "released", 0, "image/jpeg");
    await attach("memo", "released", 1, "audio/mp4");
    await attach("solo-memo", "solo", 0, "audio/mp4");
    await attach("unreleased-memo", "unreleased", 0, "audio/mp4");
    await attach("removed-memo", "detached", 0, "audio/mp4", true);
    await attach("plain-photo", "plain", 0, "image/jpeg");
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

  it("gives an active friend a released post's voice memo, with its object", async () => {
    await expect(voiceMemos().findVoiceMemo(users.friend, id("released"), now)).resolves.toEqual({
      id: id("memo"),
      postId: id("released"),
      contentType: "audio/mp4",
      objectKey: `media/${users.author}/${id("reservation-memo")}`,
    });
  });

  it("keeps a voice memo private until its post is released, and for solo posts", async () => {
    await expect(voiceMemos().findVoiceMemo(users.friend, id("unreleased"), now)).resolves.toBeNull();
    await expect(voiceMemos().findVoiceMemo(users.friend, id("solo"), now)).resolves.toBeNull();
    await expect(voiceMemos().findVoiceMemo(users.stranger, id("solo"), now)).resolves.toBeNull();
    await expect(voiceMemos().findVoiceMemo(null, id("solo"), now)).resolves.toBeNull();
  });

  it("lets only the author reach a solo or unreleased voice memo", async () => {
    await expect(voiceMemos().findVoiceMemo(users.author, id("solo"), now)).resolves.not.toBeNull();
    await expect(voiceMemos().findVoiceMemo(users.author, id("unreleased"), now)).resolves.not.toBeNull();
  });

  it("refuses strangers and anonymous viewers on a released friends post", async () => {
    await expect(voiceMemos().findVoiceMemo(users.stranger, id("released"), now)).resolves.toBeNull();
    await expect(voiceMemos().findVoiceMemo(null, id("released"), now)).resolves.toBeNull();
  });

  it("refuses a detached voice memo and a post that never had one", async () => {
    await expect(voiceMemos().findVoiceMemo(users.friend, id("detached"), now)).resolves.toBeNull();
    await expect(voiceMemos().findVoiceMemo(users.friend, id("plain"), now)).resolves.toBeNull();
    await expect(voiceMemos().findVoiceMemo(users.author, id("plain"), now)).resolves.toBeNull();
  });

  it("stops serving the voice memo as soon as the author blocks, unfriends, or changes the audience", async () => {
    // Each change is made as the migrator and observed by the very next read.
    await migrator.db.insert(schema.relationshipBlocks).values({
      blockerId: users.author,
      blockedId: users.blocked,
      blockedAt: now,
    });
    await expect(voiceMemos().findVoiceMemo(users.blocked, id("released"), now)).resolves.toBeNull();

    // Friendship rows are reciprocal: both must change together.
    await migrator.db.transaction(async (tx) => {
      await tx.update(schema.friendships).set({ state: "ended" }).where(or(
        and(eq(schema.friendships.userId, users.unfriended), eq(schema.friendships.friendId, users.author)),
        and(eq(schema.friendships.userId, users.author), eq(schema.friendships.friendId, users.unfriended)),
      ));
    });
    await expect(voiceMemos().findVoiceMemo(users.unfriended, id("released"), now)).resolves.toBeNull();

    await expect(voiceMemos().findVoiceMemo(users.friend, id("released"), now)).resolves.not.toBeNull();
    await migrator.db.update(schema.posts).set({ audience: "solo" }).where(eq(schema.posts.id, id("released")));
    await expect(voiceMemos().findVoiceMemo(users.friend, id("released"), now)).resolves.toBeNull();
    await expect(voiceMemos().findVoiceMemo(users.author, id("released"), now)).resolves.not.toBeNull();
    await migrator.db.update(schema.posts).set({ audience: "friends" }).where(eq(schema.posts.id, id("released")));
  });

  it("honours a validated public link only for its own released friends post", async () => {
    const grant = { postId: id("released"), active: true };
    await expect(voiceMemos().findVoiceMemo(null, id("released"), now, grant)).resolves.not.toBeNull();
    await expect(voiceMemos().findVoiceMemo(null, id("released"), now, { ...grant, active: false }))
      .resolves.toBeNull();
    await expect(voiceMemos().findVoiceMemo(null, id("solo"), now, { postId: id("solo"), active: true }))
      .resolves.toBeNull();
  });

  it("keeps the voice memo out of the photo and video list", async () => {
    const byPost = await readAttachedMedia(app.db, [id("released")]);
    expect(byPost.get(id("released"))?.map((item) => item.id)).toEqual([id("photo")]);
    await expect(readAttachedVoiceMemo(app.db, id("released"))).resolves.toMatchObject({ id: id("memo") });
    await expect(readAttachedVoiceMemo(app.db, id("plain"))).resolves.toBeNull();
  });
});
