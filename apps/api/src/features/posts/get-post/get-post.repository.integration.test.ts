import { createDayliDatabase, schema } from "@dayli/db";
import { inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPostgresPostDetailRepository } from "./get-post.repository";

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
      viewerIsAuthor: false,
      media: [],
    });
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
  ] as const)("conceals the post from %s", async (_, viewer, post) => {
    await expect(repo().findPost(users[viewer], id(post), now)).resolves.toBeNull();
  });

  it("opens an unreleased post to friends at release time", async () => {
    const released = await repo().findPost(users.friend, id("unreleased"), new Date("2026-09-26T12:00:00.000Z"));

    expect(released).toMatchObject({ id: id("unreleased"), viewerIsAuthor: false });
  });
});
