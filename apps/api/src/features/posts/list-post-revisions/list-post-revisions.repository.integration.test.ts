import { createDayliDatabase, schema } from "@dayli/db";
import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPostgresPostRevisionsRepository, InvalidRevisionCursorError } from "./list-post-revisions.repository";

const migratorUrl = process.env.TEST_DATABASE_URL;
const appUrl = process.env.TEST_APP_DATABASE_URL;
const enabled = Boolean(migratorUrl && appUrl && process.env.POSTS_POSTGRES_TEST === "1");
const testPostgresPort = process.env.VERIFY_POSTGRES_PORT ?? "5433";

function requireLocalTestUrl(value: string): string {
  const url = new URL(value);
  if (url.hostname !== "localhost" || url.port !== testPostgresPort || url.pathname !== "/dayli_test") {
    throw new Error(`Post revision tests must target localhost:${testPostgresPort}/dayli_test.`);
  }
  return value;
}

/** Reads run through the restricted app role; fixtures are unique per run. */
(enabled ? describe : describe.skip)("PostgreSQL post revisions", () => {
  const migrator = createDayliDatabase(requireLocalTestUrl(migratorUrl ?? "postgresql://localhost:5433/dayli_test"));
  const app = createDayliDatabase(requireLocalTestUrl(appUrl ?? "postgresql://localhost:5433/dayli_test"));
  const run = crypto.randomUUID().replaceAll("-", "").slice(0, 10);
  const id = (name: string) => `revs-${run}-${name}`;
  const users = { author: id("author"), friend: id("friend"), stranger: id("stranger"), blocked: id("blocked") };
  const userIds = Object.values(users);
  const now = new Date("2026-09-26T03:00:00.000Z");
  const repo = () => createPostgresPostRevisionsRepository(app.db);
  const postId = id("post");

  beforeAll(async () => {
    for (const [key, userId] of Object.entries(users)) {
      await migrator.db.insert(schema.user).values({
        id: userId,
        name: key,
        email: `${userId}@example.test`,
        username: `r${run}${key}`.slice(0, 30),
      });
    }
    for (const friend of [users.friend, users.blocked]) {
      await migrator.db.insert(schema.friendships).values([
        { userId: users.author, friendId: friend, state: "active", stateChangedAt: now },
        { userId: friend, friendId: users.author, state: "active", stateChangedAt: now },
      ]);
    }
    await migrator.db.insert(schema.relationshipBlocks).values({ blockerId: users.blocked, blockedId: users.author, blockedAt: now });
    await migrator.db.insert(schema.posts).values({
      id: postId,
      authorId: users.author,
      localDate: "2026-09-24",
      promptId: "prompt-09-24",
      reflectiveAnswer: "Shared answer",
      rating: 7,
      audience: "friends",
      acceptedAt: new Date("2026-09-24T03:00:00.000Z"),
      releasedAt: new Date("2026-09-24T12:00:00.000Z"),
    });
    // Written while solo, then shared, then edited again.
    const revision = (number: number, answer: string, audience: "solo" | "friends") => ({
      id: id(`rev-${number}`),
      postId,
      revisionNumber: number,
      previousReflectiveAnswer: answer,
      previousRating: number,
      previousAudience: audience,
      previousPromptId: "prompt-09-24",
      previousAttachmentRefs: [],
      createdAt: new Date(`2026-09-25T0${number}:00:00.000Z`),
    });
    await migrator.db.insert(schema.postRevisions).values([
      revision(1, "Private draft", "solo"),
      revision(2, "Shared draft", "friends"),
      revision(3, "Second shared draft", "friends"),
    ]);
  });

  afterAll(async () => {
    try {
      await migrator.db.delete(schema.postRevisions).where(eq(schema.postRevisions.postId, postId));
      await migrator.db.delete(schema.posts).where(inArray(schema.posts.authorId, userIds));
      await migrator.db.delete(schema.relationshipBlocks).where(inArray(schema.relationshipBlocks.blockerId, userIds));
      await migrator.db.delete(schema.friendships).where(inArray(schema.friendships.userId, userIds));
      await migrator.db.delete(schema.user).where(inArray(schema.user.id, userIds));
    } finally {
      await Promise.all([app.close(), migrator.close()]);
    }
  });

  it("shows the author every earlier version, newest first", async () => {
    const page = await repo().listRevisions(users.author, postId, now, 20);

    expect(page?.items.map((item) => [item.revisionNumber, item.reflectiveAnswer, item.audience])).toEqual([
      [3, "Second shared draft", "friends"],
      [2, "Shared draft", "friends"],
      [1, "Private draft", "solo"],
    ]);
    expect(page?.items[0]).toMatchObject({ caption: null, rating: 3, replacedAt: "2026-09-25T03:00:00.000Z" });
    expect(page).toMatchObject({ nextCursor: null, hasMore: false });
  });

  it("never shows a friend a version written while the post was solo", async () => {
    const page = await repo().listRevisions(users.friend, postId, now, 20);

    expect(page?.items.map((item) => item.reflectiveAnswer)).toEqual(["Second shared draft", "Shared draft"]);
  });

  it("pages with an opaque cursor", async () => {
    const first = await repo().listRevisions(users.author, postId, now, 2);
    const second = await repo().listRevisions(users.author, postId, now, 2, first!.nextCursor!);

    expect(first).toMatchObject({ hasMore: true });
    expect(second?.items.map((item) => item.revisionNumber)).toEqual([1]);
    expect(second).toMatchObject({ nextCursor: null, hasMore: false });
    await expect(repo().listRevisions(users.author, postId, now, 2, "not-a-cursor")).rejects.toBeInstanceOf(InvalidRevisionCursorError);
  });

  it.each([
    ["a stranger", "stranger"],
    ["a friend who blocked the author", "blocked"],
  ] as const)("conceals the history from %s", async (_, viewer) => {
    await expect(repo().listRevisions(users[viewer], postId, now, 20)).resolves.toBeNull();
  });

  it("conceals the history once the post is deleted", async () => {
    await migrator.db.update(schema.posts).set({ trashedAt: now, restoreUntil: new Date(now.getTime() + 168 * 3_600_000), trashPurgeDueAt: new Date(now.getTime() + 336 * 3_600_000) }).where(eq(schema.posts.id, postId));

    await expect(repo().listRevisions(users.author, postId, now, 20)).resolves.toBeNull();
    await expect(repo().listRevisions(users.friend, postId, now, 20)).resolves.toBeNull();
  });
});
