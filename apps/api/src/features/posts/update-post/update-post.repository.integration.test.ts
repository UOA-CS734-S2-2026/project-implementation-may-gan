import { createDayliDatabase, schema } from "@dayli/db";
import { asc, eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createPostgresUpdatePostRepository } from "./update-post.repository";

const migratorUrl = process.env.TEST_DATABASE_URL;
const appUrl = process.env.TEST_APP_DATABASE_URL;
const enabled = Boolean(migratorUrl && appUrl && process.env.POSTS_POSTGRES_TEST === "1");
const testPostgresPort = process.env.VERIFY_POSTGRES_PORT ?? "5433";

function requireLocalTestUrl(value: string): string {
  const url = new URL(value);
  if (url.hostname !== "localhost" || url.port !== testPostgresPort || url.pathname !== "/dayli_test") {
    throw new Error(`Post edit tests must target localhost:${testPostgresPort}/dayli_test.`);
  }
  return value;
}

/** Edits run through the restricted app role; fixtures are unique per run. */
(enabled ? describe : describe.skip)("PostgreSQL post editing", () => {
  const migrator = createDayliDatabase(requireLocalTestUrl(migratorUrl ?? "postgresql://localhost:5433/dayli_test"));
  const app = createDayliDatabase(requireLocalTestUrl(appUrl ?? "postgresql://localhost:5433/dayli_test"));
  const run = crypto.randomUUID().replaceAll("-", "").slice(0, 10);
  const id = (name: string) => `edit-${run}-${name}`;
  const users = { author: id("author"), friend: id("friend") };
  const userIds = Object.values(users);
  const now = new Date("2026-09-26T03:00:00.000Z");
  const repo = () => createPostgresUpdatePostRepository(app.db);
  let postId = "";
  let posts = 0;

  async function revisions(post: string) {
    return migrator.db
      .select()
      .from(schema.postRevisions)
      .where(eq(schema.postRevisions.postId, post))
      .orderBy(asc(schema.postRevisions.revisionNumber));
  }

  async function current(post: string) {
    const [row] = await migrator.db.select().from(schema.posts).where(eq(schema.posts.id, post));
    return row!;
  }

  beforeAll(async () => {
    for (const [key, userId] of Object.entries(users)) {
      await migrator.db.insert(schema.user).values({
        id: userId,
        name: key,
        email: `${userId}@example.test`,
        username: `e${run}${key}`.slice(0, 30),
      });
    }
  });

  // Each test edits a fresh post on its own day.
  beforeEach(async () => {
    posts += 1;
    postId = id(`post-${posts}`);
    const localDate = `2026-08-${String(posts).padStart(2, "0")}`;
    await migrator.db.insert(schema.posts).values({
      id: postId,
      authorId: users.author,
      localDate,
      promptId: `prompt-${localDate.slice(5)}`,
      reflectiveAnswer: "First answer",
      caption: "Sunset",
      rating: 6,
      audience: "friends",
      acceptedAt: new Date(`${localDate}T03:00:00.000Z`),
      releasedAt: new Date(`${localDate}T12:00:00.000Z`),
    });
  });

  afterAll(async () => {
    try {
      const authored = migrator.db.select({ id: schema.posts.id }).from(schema.posts).where(inArray(schema.posts.authorId, userIds));
      await migrator.db.delete(schema.postRevisions).where(inArray(schema.postRevisions.postId, authored));
      await migrator.db.delete(schema.posts).where(inArray(schema.posts.authorId, userIds));
      await migrator.db.delete(schema.user).where(inArray(schema.user.id, userIds));
    } finally {
      await Promise.all([app.close(), migrator.close()]);
    }
  });

  it("saves the edit and keeps the previous version as revision 1", async () => {
    await expect(repo().updatePost(users.author, postId, 0, { reflectiveAnswer: "Second answer", rating: 8 }, now))
      .resolves.toBe("updated");

    expect(await current(postId)).toMatchObject({ reflectiveAnswer: "Second answer", rating: 8, caption: "Sunset" });
    expect(await revisions(postId)).toEqual([expect.objectContaining({
      revisionNumber: 1,
      previousReflectiveAnswer: "First answer",
      previousCaption: "Sunset",
      previousRating: 6,
      previousAudience: "friends",
      previousPromptId: `prompt-08-${String(posts).padStart(2, "0")}`,
      previousAttachmentRefs: [],
      createdAt: now,
    })]);
  });

  it("removes the caption and changes the audience", async () => {
    await expect(repo().updatePost(users.author, postId, 0, { caption: null, audience: "solo" }, now))
      .resolves.toBe("updated");

    expect(await current(postId)).toMatchObject({ caption: null, audience: "solo" });
  });

  it("treats a retry of a saved edit as unchanged without another revision", async () => {
    await repo().updatePost(users.author, postId, 0, { reflectiveAnswer: "Second answer" }, now);

    await expect(repo().updatePost(users.author, postId, 0, { reflectiveAnswer: "Second answer" }, now))
      .resolves.toBe("unchanged");
    expect(await revisions(postId)).toHaveLength(1);
  });

  it("rejects an edit based on a stale revision count", async () => {
    await repo().updatePost(users.author, postId, 0, { reflectiveAnswer: "Second answer" }, now);

    await expect(repo().updatePost(users.author, postId, 0, { rating: 2 }, now)).resolves.toBe("conflict");
    await expect(repo().updatePost(users.author, postId, 1, { rating: 2 }, now)).resolves.toBe("updated");
    expect((await revisions(postId)).map((revision) => revision.revisionNumber)).toEqual([1, 2]);
  });

  it("lets exactly one of two concurrent edits win", async () => {
    const outcomes = await Promise.all([
      repo().updatePost(users.author, postId, 0, { rating: 9 }, now),
      repo().updatePost(users.author, postId, 0, { rating: 3 }, now),
    ]);

    expect([...outcomes].sort()).toEqual(["conflict", "updated"]);
    expect(await revisions(postId)).toHaveLength(1);
  });

  it("conceals posts that belong to someone else, are deleted, or don't exist", async () => {
    await expect(repo().updatePost(users.friend, postId, 0, { rating: 1 }, now)).resolves.toBe("not_found");
    await expect(repo().updatePost(users.author, id("missing"), 0, { rating: 1 }, now)).resolves.toBe("not_found");

    await migrator.db.update(schema.posts).set({ trashedAt: now, restoreUntil: new Date(now.getTime() + 168 * 3_600_000), trashPurgeDueAt: new Date(now.getTime() + 336 * 3_600_000) }).where(eq(schema.posts.id, postId));
    await expect(repo().updatePost(users.author, postId, 0, { rating: 1 }, now)).resolves.toBe("not_found");
    expect(await revisions(postId)).toHaveLength(0);
  });
});
