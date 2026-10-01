import { createDayliDatabase, schema } from "@dayli/db";
import { inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPostgresFeedRepository, InvalidFeedCursorError, StaleFeedCursorError } from "./list-feed.repository";

const migratorUrl = process.env.TEST_DATABASE_URL;
const appUrl = process.env.TEST_APP_DATABASE_URL;
const enabled = Boolean(migratorUrl && appUrl && process.env.POSTS_POSTGRES_TEST === "1");
const testPostgresPort = process.env.VERIFY_POSTGRES_PORT ?? "5433";

function requireLocalTestUrl(value: string): string {
  const url = new URL(value);
  if (url.hostname !== "localhost" || url.port !== testPostgresPort || url.pathname !== "/dayli_test") {
    throw new Error(`Feed tests must target localhost:${testPostgresPort}/dayli_test.`);
  }
  return value;
}

/**
 * Reads run through the restricted app role, as the Worker does. Fixture rows
 * are written by the migrator, are unique per run, and are removed afterwards.
 */
(enabled ? describe : describe.skip)("PostgreSQL friends feed", () => {
  const migrator = createDayliDatabase(requireLocalTestUrl(migratorUrl ?? "postgresql://localhost:5433/dayli_test"));
  const app = createDayliDatabase(requireLocalTestUrl(appUrl ?? "postgresql://localhost:5433/dayli_test"));
  const run = crypto.randomUUID().replaceAll("-", "").slice(0, 10);
  const id = (name: string) => `feed-${run}-${name}`;
  const users = {
    viewer: id("viewer"),
    friendA: id("friend-a"),
    friendB: id("friend-b"),
    friendC: id("friend-c"),
    soloFriend: id("solo-friend"),
    stranger: id("stranger"),
    ended: id("ended"),
    blocked: id("blocked"),
    blocker: id("blocker"),
    noUsername: id("no-username"),
  };
  const userIds = Object.values(users);
  const now = new Date("2026-09-26T03:00:00.000Z");
  const feed = () => createPostgresFeedRepository(app.db);

  async function insertPost(key: string, authorId: string, localDate: string, options: { audience?: "solo" | "friends"; released?: boolean } = {}) {
    const acceptedAt = `${localDate}T03:00:00.000Z`;
    const releasedAt = options.released === false ? "2026-09-26T12:00:00.000Z" : `${localDate}T12:00:00.000Z`;
    await migrator.db.insert(schema.posts).values({
      id: id(key),
      authorId,
      localDate,
      promptId: `prompt-${localDate.slice(5)}`,
      reflectiveAnswer: `Answer ${key}`,
      rating: 7,
      audience: options.audience ?? "friends",
      acceptedAt: new Date(acceptedAt),
      releasedAt: new Date(releasedAt),
    });
  }

  /** The database requires both directional rows, with the same state, in one statement. */
  async function befriend(a: string, b: string, state: "active" | "ended" = "active") {
    await migrator.db.insert(schema.friendships).values([
      { userId: a, friendId: b, state, stateChangedAt: now },
      { userId: b, friendId: a, state, stateChangedAt: now },
    ]);
  }

  beforeAll(async () => {
    for (const [key, userId] of Object.entries(users)) {
      const username = key === "noUsername" ? null : `f${run}${key.toLowerCase()}`.slice(0, 30);
      await migrator.db.insert(schema.user).values({
        id: userId,
        name: key,
        email: `${userId}@example.test`,
        username,
        displayUsername: key === "friendA" ? "Friend A" : null,
      });
    }

    await befriend(users.viewer, users.friendA);
    await befriend(users.viewer, users.friendB);
    await befriend(users.viewer, users.friendC);
    await befriend(users.viewer, users.soloFriend);
    await befriend(users.viewer, users.blocked);
    await befriend(users.viewer, users.blocker);
    await befriend(users.viewer, users.noUsername);
    await befriend(users.viewer, users.ended, "ended");
    await migrator.db.insert(schema.relationshipBlocks).values([
      { blockerId: users.viewer, blockedId: users.blocked, blockedAt: now },
      { blockerId: users.blocker, blockedId: users.viewer, blockedAt: now },
    ]);

    // `now` is 26 September in Auckland, so the feed is 25 September's posts.
    await insertPost("a-25", users.friendA, "2026-09-25");
    await insertPost("b-25", users.friendB, "2026-09-25");
    await insertPost("c-25", users.friendC, "2026-09-25");
    // Hidden: older days stay on profiles, today is unreleased, and the rest
    // are never the viewer's to see.
    await insertPost("a-24", users.friendA, "2026-09-24");
    await insertPost("c-20", users.friendC, "2026-09-20");
    await insertPost("b-26-unreleased", users.friendB, "2026-09-26", { released: false });
    await insertPost("solo-25", users.soloFriend, "2026-09-25", { audience: "solo" });
    await insertPost("viewer-25", users.viewer, "2026-09-25");
    await insertPost("stranger-25", users.stranger, "2026-09-25");
    await insertPost("ended-25", users.ended, "2026-09-25");
    await insertPost("blocked-25", users.blocked, "2026-09-25");
    await insertPost("blocker-25", users.blocker, "2026-09-25");
    await insertPost("no-username-25", users.noUsername, "2026-09-25");

    await migrator.db.insert(schema.postRevisions).values({
      id: id("rev-1"),
      postId: id("b-25"),
      revisionNumber: 1,
      previousReflectiveAnswer: "Before the edit",
      previousRating: 6,
      previousAudience: "friends",
      previousPromptId: "prompt-09-25",
      previousAttachmentRefs: [],
    });
  });

  afterAll(async () => {
    try {
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

  it("lists only yesterday's friends posts by active, unblocked friends", async () => {
    const page = await feed().listFeed(users.viewer, now, 20);

    expect(page.items.map((post) => post.id)).toEqual([id("c-25"), id("b-25"), id("a-25")]);
    expect(page).toMatchObject({ hasMore: false, nextCursor: null, feedDate: "2026-09-25" });
  });

  it("projects the author, prompt, and edited marker", async () => {
    const page = await feed().listFeed(users.viewer, now, 20);
    const [, edited, friendA] = page.items;

    expect(edited).toMatchObject({ id: id("b-25"), edited: true, audience: "friends" });
    expect(friendA).toEqual({
      id: id("a-25"),
      author: { id: users.friendA, username: `f${run}frienda`.slice(0, 30), displayName: "Friend A" },
      localDate: "2026-09-25",
      prompt: { id: "prompt-09-25", text: expect.any(String) },
      reflectiveAnswer: "Answer a-25",
      caption: null,
      rating: 7,
      audience: "friends",
      acceptedAt: "2026-09-25T03:00:00.000Z",
      releasedAt: "2026-09-25T12:00:00.000Z",
      edited: false,
      media: [],
    });
  });

  it("pages deterministically without repeating or skipping posts", async () => {
    const first = await feed().listFeed(users.viewer, now, 2);
    expect(first.items.map((post) => post.id)).toEqual([id("c-25"), id("b-25")]);
    expect(first.hasMore).toBe(true);

    const second = await feed().listFeed(users.viewer, now, 2, first.nextCursor!);
    expect(second.items.map((post) => post.id)).toEqual([id("a-25")]);
    expect(second).toMatchObject({ hasMore: false, nextCursor: null });
  });

  it("moves on to the next day at Auckland midnight", async () => {
    const justBefore = await feed().listFeed(users.viewer, new Date("2026-09-26T10:59:59.999Z"), 20);
    expect(justBefore.items.map((post) => post.id)).toEqual([id("c-25"), id("b-25"), id("a-25")]);

    const afterMidnight = await feed().listFeed(users.viewer, new Date("2026-09-26T12:00:00.000Z"), 20);
    expect(afterMidnight.items.map((post) => post.id)).toEqual([id("b-26-unreleased")]);
  });

  it("rejects a cursor carried across midnight instead of returning an empty page", async () => {
    const beforeMidnight = await feed().listFeed(users.viewer, new Date("2026-09-26T10:59:59.999Z"), 2);
    expect(beforeMidnight.hasMore).toBe(true);

    // Daylight saving starts on the 27th, so that midnight is 12:00 UTC.
    const afterMidnight = new Date("2026-09-26T12:00:00.000Z");
    await expect(feed().listFeed(users.viewer, afterMidnight, 2, beforeMidnight.nextCursor!))
      .rejects.toMatchObject({ name: "StaleFeedCursorError", feedDate: "2026-09-26" });
    await expect(feed().listFeed(users.viewer, afterMidnight, 2, beforeMidnight.nextCursor!))
      .rejects.toBeInstanceOf(StaleFeedCursorError);
  });

  it("never shows a friend's feed to the stranger", async () => {
    const page = await feed().listFeed(users.stranger, now, 20);

    expect(page.items).toEqual([]);
  });

  it("rejects an unreadable cursor", async () => {
    await expect(feed().listFeed(users.viewer, now, 20, "not-a-cursor")).rejects.toBeInstanceOf(InvalidFeedCursorError);
    const impossibleDate = btoa(JSON.stringify(["2026-99-99", id("b-25")])).replaceAll("=", "");
    await expect(feed().listFeed(users.viewer, now, 20, impossibleDate)).rejects.toBeInstanceOf(InvalidFeedCursorError);
  });
});
