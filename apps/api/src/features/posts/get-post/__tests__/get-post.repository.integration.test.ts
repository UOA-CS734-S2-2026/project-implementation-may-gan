import { createDayliDatabase, schema } from "@dayli/db";
import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPostgresPostDetailRepository } from "../../shared/post-detail.repository";

const migratorUrl = process.env.TEST_DATABASE_URL;
const appUrl = process.env.TEST_APP_DATABASE_URL;
const enabled = Boolean(migratorUrl && appUrl && process.env.POSTS_POSTGRES_TEST === "1");
const testPostgresPort = process.env.VERIFY_POSTGRES_PORT ?? "5433";

function requireLocalTestUrl(value: string): string {
  const url = new URL(value);
  if (url.hostname !== "localhost" || url.port !== testPostgresPort || url.pathname !== "/dayli_test") {
    throw new Error(`Post detail tests must target localhost:${testPostgresPort}/dayli_test.`);
  }
  return value;
}

/** Reads run through the restricted app role; fixtures are unique per run. */
(enabled ? describe : describe.skip)("PostgreSQL post detail", () => {
  const migrator = createDayliDatabase(requireLocalTestUrl(migratorUrl ?? "postgresql://localhost:5433/dayli_test"));
  const app = createDayliDatabase(requireLocalTestUrl(appUrl ?? "postgresql://localhost:5433/dayli_test"));
  const run = crypto.randomUUID().replaceAll("-", "").slice(0, 10);
  const id = (name: string) => `detail-${run}-${name}`;
  const users = {
    author: id("author"),
    friend: id("friend"),
    stranger: id("stranger"),
    ended: id("ended"),
    blocked: id("blocked"),
  };
  const userIds = Object.values(users);
  const now = new Date("2026-09-26T03:00:00.000Z");
  const repo = () => createPostgresPostDetailRepository(app.db);

  async function insertPost(key: string, localDate: string, audience: "solo" | "friends", released: boolean) {
    await migrator.db.insert(schema.posts).values({
      id: id(key),
      authorId: users.author,
      localDate,
      promptId: `prompt-${localDate.slice(5)}`,
      reflectiveAnswer: `Answer ${key}`,
      caption: "Sunset",
      rating: 8,
      audience,
      acceptedAt: new Date(`${localDate}T03:00:00.000Z`),
      releasedAt: new Date(released ? `${localDate}T12:00:00.000Z` : "2026-09-26T12:00:00.000Z"),
    });
  }

  async function befriend(other: string, state: "active" | "ended") {
    await migrator.db.insert(schema.friendships).values([
      { userId: users.author, friendId: other, state, stateChangedAt: now },
      { userId: other, friendId: users.author, state, stateChangedAt: now },
    ]);
  }

  beforeAll(async () => {
    for (const [key, userId] of Object.entries(users)) {
      await migrator.db.insert(schema.user).values({
        id: userId,
        name: key,
        email: `${userId}@example.test`,
        username: `d${run}${key}`.slice(0, 30),
        displayUsername: key === "author" ? "The Author" : null,
      });
    }
    await befriend(users.friend, "active");
    await befriend(users.blocked, "active");
    await befriend(users.ended, "ended");
    await migrator.db.insert(schema.relationshipBlocks).values({
      blockerId: users.author,
      blockedId: users.blocked,
      blockedAt: now,
    });

    await insertPost("released", "2026-09-24", "friends", true);
    await insertPost("solo", "2026-09-23", "solo", true);
    await insertPost("unreleased", "2026-09-26", "friends", false);
    await insertPost("deleted", "2026-09-22", "friends", true);
    await migrator.db.update(schema.posts).set({ trashedAt: now, restoreUntil: new Date(now.getTime() + 168 * 3_600_000), trashPurgeDueAt: new Date(now.getTime() + 336 * 3_600_000) }).where(eq(schema.posts.id, id("deleted")));
    await migrator.db.insert(schema.postRevisions).values({
      id: id("rev-1"),
      postId: id("released"),
      revisionNumber: 1,
      previousReflectiveAnswer: "Before the edit",
      previousRating: 6,
      previousAudience: "friends",
      previousPromptId: "prompt-09-24",
      previousAttachmentRefs: [],
    });
  });

  afterAll(async () => {
    try {
      await migrator.db.delete(schema.postLikes).where(eq(schema.postLikes.postId, id("released")));
      await migrator.db.delete(schema.postComments).where(eq(schema.postComments.postId, id("released")));
      await migrator.db.delete(schema.postRevisions).where(inArray(
        schema.postRevisions.postId,
        migrator.db.select({ id: schema.posts.id }).from(schema.posts).where(inArray(schema.posts.authorId, userIds)),
      ));
      await migrator.db.delete(schema.posts).where(inArray(schema.posts.authorId, userIds));
      await migrator.db.delete(schema.relationshipBlocks).where(inArray(schema.relationshipBlocks.blockerId, userIds));
      await migrator.db.delete(schema.friendships).where(inArray(schema.friendships.userId, userIds));
      await migrator.db.delete(schema.user).where(inArray(schema.user.id, userIds));
    } finally {
      await Promise.all([app.close(), migrator.close()]);
    }
  });

  it("returns a released friends post to an active friend with its stored prompt", async () => {
    await expect(repo().findPost(users.friend, id("released"), now)).resolves.toEqual({
      id: id("released"),
      author: { id: users.author, username: `d${run}author`.slice(0, 30), displayName: "The Author" },
      localDate: "2026-09-24",
      prompt: { id: "prompt-09-24", text: expect.any(String) },
      reflectiveAnswer: "Answer released",
      caption: "Sunset",
      rating: 8,
      audience: "friends",
      acceptedAt: "2026-09-24T03:00:00.000Z",
      releasedAt: "2026-09-24T12:00:00.000Z",
      edited: true,
      revisionCount: 1,
      likeCount: 0,
      viewerHasLiked: false,
      commentCount: 0,
      viewerIsAuthor: false,
      media: [],
      voiceMemo: null,
      weather: null,
      publicMediaDelivery: false,
    });
  });

  it("returns the weather snapshot to a reader of the post and nothing to someone who can't read it", async () => {
    await migrator.db.update(schema.posts)
      .set({ weatherCondition: "snow", weatherTemperatureC: -3, weatherPlaceName: "Queenstown" })
      .where(eq(schema.posts.id, id("released")));
    try {
      await expect(repo().findPost(users.friend, id("released"), now)).resolves.toMatchObject({
        weather: { condition: "snow", temperatureC: -3, placeName: "Queenstown" },
      });
      await expect(repo().findPost(users.author, id("released"), now)).resolves.toMatchObject({
        weather: { condition: "snow", temperatureC: -3, placeName: "Queenstown" },
      });
      // A reader who can't see the post gets no record at all, so no weather.
      await expect(repo().findPost(users.blocked, id("released"), now)).resolves.toBeNull();
      await migrator.db.update(schema.user).set({ profileVisibility: "private" }).where(eq(schema.user.id, users.author));
      await expect(repo().findPost(users.stranger, id("released"), now)).resolves.toBeNull();
      await expect(repo().findPost(null, id("released"), now)).resolves.toBeNull();
    } finally {
      await migrator.db.update(schema.user).set({ profileVisibility: "public" }).where(eq(schema.user.id, users.author));
      await migrator.db.update(schema.posts)
        .set({ weatherCondition: null, weatherTemperatureC: null, weatherPlaceName: null })
        .where(eq(schema.posts.id, id("released")));
    }
  });

  it("doesn't count a version written while the post was solo for friends", async () => {
    await migrator.db.insert(schema.postRevisions).values({
      id: id("rev-2"),
      postId: id("released"),
      revisionNumber: 2,
      previousReflectiveAnswer: "Written while solo",
      previousRating: 5,
      previousAudience: "solo",
      previousPromptId: "prompt-09-24",
      previousAttachmentRefs: [],
    });

    await expect(repo().findPost(users.friend, id("released"), now)).resolves.toMatchObject({ edited: true, revisionCount: 1 });
    await expect(repo().findPost(users.author, id("released"), now)).resolves.toMatchObject({ edited: true, revisionCount: 2 });
  });

  it("lets anyone read a released friends post after the author becomes public", async () => {
    await migrator.db.update(schema.user)
      .set({ profileVisibility: "public" })
      .where(inArray(schema.user.id, [users.author]));
    try {
      await expect(repo().findPost(null, id("released"), now)).resolves.toMatchObject({
        id: id("released"),
        viewerIsAuthor: false,
        publicMediaDelivery: false,
      });
      await expect(repo().findPost(users.stranger, id("released"), now)).resolves.toMatchObject({ id: id("released") });
      await expect(repo().findPost(null, id("solo"), now)).resolves.toBeNull();
      await expect(repo().findPost(null, id("unreleased"), now)).resolves.toBeNull();
      await expect(repo().findPost(users.blocked, id("released"), now)).resolves.toBeNull();
    } finally {
      await migrator.db.update(schema.user)
        .set({ profileVisibility: "private" })
        .where(inArray(schema.user.id, [users.author]));
    }
  });

  it("lets the author read their solo and unreleased posts", async () => {
    const solo = await repo().findPost(users.author, id("solo"), now);
    const unreleased = await repo().findPost(users.author, id("unreleased"), now);

    expect(solo).toMatchObject({ audience: "solo", viewerIsAuthor: true, edited: false });
    expect(unreleased).toMatchObject({ id: id("unreleased"), viewerIsAuthor: true });
  });

  it.each([
    ["a friend reading a solo post", "friend", "solo"],
    ["a friend reading before midnight", "friend", "unreleased"],
    ["a stranger", "stranger", "released"],
    ["an ended friendship", "ended", "released"],
    ["a blocked friend", "blocked", "released"],
    ["an unknown post", "friend", "missing"],
    ["the author reading a deleted post", "author", "deleted"],
    ["a friend reading a deleted post", "friend", "deleted"],
  ] as const)("conceals the post from %s", async (_, viewer, post) => {
    await expect(repo().findPost(users[viewer], id(post), now)).resolves.toBeNull();
  });

  it("counts likes and the comments the viewer can see", async () => {
    await migrator.db.insert(schema.postLikes).values([
      { postId: id("released"), userId: users.friend },
      { postId: id("released"), userId: users.author },
    ]);
    const comment = (key: string, authorId: string, deleted = false) => ({
      id: id(key),
      postId: id("released"),
      authorId,
      clientCommentId: id(key),
      body: key,
      deletedAt: deleted ? now : null,
      deletedBy: deleted ? authorId : null,
    });
    await migrator.db.insert(schema.postComments).values([
      comment("comment-1", users.friend),
      comment("comment-2", users.author),
      comment("comment-gone", users.friend, true),
    ]);

    await expect(repo().findPost(users.friend, id("released"), now))
      .resolves.toMatchObject({ likeCount: 2, viewerHasLiked: true, commentCount: 2 });
    await expect(repo().findPost(users.author, id("solo"), now))
      .resolves.toMatchObject({ likeCount: 0, viewerHasLiked: false, commentCount: 0 });
  });

  it("opens an unreleased post to friends at release time", async () => {
    const released = await repo().findPost(users.friend, id("unreleased"), new Date("2026-09-26T12:00:00.000Z"));

    expect(released).toMatchObject({ id: id("unreleased"), viewerIsAuthor: false });
  });
});
