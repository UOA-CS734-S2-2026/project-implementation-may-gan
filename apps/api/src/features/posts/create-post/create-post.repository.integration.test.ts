import { createDayliDatabase, schema, sql } from "@dayli/db";
import { count, eq, inArray } from "drizzle-orm";
import { createAucklandDayService } from "@dayli/domain";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPostgresDailyPostStore } from "./create-post.repository";
import { CreateDailyPostError, createDailyPostService, type CreateDailyPostInput } from "./create-post.service";

const migratorUrl = process.env.TEST_DATABASE_URL;
const appUrl = process.env.TEST_APP_DATABASE_URL;
const enabled = Boolean(migratorUrl && appUrl && process.env.POSTS_POSTGRES_TEST === "1");
const testPostgresPort = process.env.VERIFY_POSTGRES_PORT ?? "5433";

function requireLocalTestUrl(value: string): string {
  const url = new URL(value);
  if (url.hostname !== "localhost" || url.port !== testPostgresPort || url.pathname !== "/dayli_test") {
    throw new Error(`Post creation tests must target localhost:${testPostgresPort}/dayli_test.`);
  }
  return value;
}

/**
 * Submissions run through the restricted app role, as the Worker does, and
 * commit so concurrent connections contend on the real advisory lock and
 * constraints. Fixture users are unique per run and removed by the migrator.
 */
(enabled ? describe : describe.skip)("PostgreSQL daily post creation", () => {
  const migrator = createDayliDatabase(requireLocalTestUrl(migratorUrl ?? "postgresql://localhost:5433/dayli_test"));
  const app = createDayliDatabase(requireLocalTestUrl(appUrl ?? "postgresql://localhost:5433/dayli_test"));
  const users = Array.from({ length: 4 }, (_, index) => `post-create-${crypto.randomUUID()}-${index}`);
  const now = new Date("2026-09-25T03:00:00.000Z");
  const clock = () => now;
  const input: CreateDailyPostInput = {
    localDate: "2026-09-25",
    promptId: "prompt-09-25",
    reflectiveAnswer: "Walked to the harbour.",
    rating: 7,
    audience: "friends",
    tomorrowNote: "Bring the camera.",
  };

  function service(database = app) {
    return createDailyPostService({
      store: createPostgresDailyPostStore(database.db),
      clock,
      dayService: createAucklandDayService(clock),
    });
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
      // Immutable post history may only be removed by the migrator cleanup role.
      await migrator.db.delete(schema.tomorrowNotes).where(inArray(schema.tomorrowNotes.authorId, users));
      await migrator.db.delete(schema.posts).where(inArray(schema.posts.authorId, users));
      await migrator.db.delete(schema.user).where(inArray(schema.user.id, users));
    } finally {
      await Promise.all([app.close(), migrator.close()]);
    }
  });

  it("stores the post, tomorrow note, and idempotency record, then replays the same key", async () => {
    const created = await service().createDailyPost(users[0]!, "key-1", input);
    const replayed = await service().createDailyPost(users[0]!, "key-1", input);

    expect(created.replayed).toBe(false);
    expect(replayed).toEqual({ post: created.post, replayed: true });
    expect(created.post).toMatchObject({
      authorId: users[0],
      localDate: "2026-09-25",
      prompt: { id: "prompt-09-25" },
      releasedAt: new Date("2026-09-25T12:00:00.000Z"),
      tomorrowNoteAvailableOn: "2026-09-26",
    });

    const [row] = await migrator.db.select({
      posts: sql<number>`(select count(*) from ${schema.posts} where ${schema.posts.authorId} = ${users[0]!})::int`,
      notes: sql<number>`(select count(*) from ${schema.tomorrowNotes} where ${schema.tomorrowNotes.authorId} = ${users[0]!})::int`,
      keys: sql<number>`(select count(*) from ${schema.postIdempotencyKeys} where ${schema.postIdempotencyKeys.authorId} = ${users[0]!})::int`,
    }).from(sql`(values (1)) as query_source`);
    expect(row).toEqual({ posts: 1, notes: 1, keys: 1 });
  });

  it("keeps a deleted post's key used and returns no content on replay", async () => {
    const created = await service().createDailyPost(users[3]!, "key-deleted", input);
    await migrator.db.update(schema.posts).set({ deletedAt: new Date("2026-09-25T04:00:00.000Z") })
      .where(eq(schema.posts.id, created.post.id));

    await expect(service().createDailyPost(users[3]!, "key-deleted", input))
      .rejects.toMatchObject({ reason: "POST_DELETED" });
    await expect(service().createDailyPost(users[3]!, "key-deleted", { ...input, rating: 2 }))
      .rejects.toMatchObject({ reason: "IDEMPOTENCY_KEY_REUSED" });
    await expect(service().createDailyPost(users[3]!, "key-again", input)).resolves.toMatchObject({ replayed: false });
  });

  it("serialises concurrent submissions across connections into exactly one post", async () => {
    const connections = Array.from({ length: 4 }, () => createDayliDatabase(requireLocalTestUrl(appUrl!)));
    try {
      const results = await Promise.allSettled(connections.flatMap((connection, index) => [
        service(connection).createDailyPost(users[1]!, "same-key", input),
        service(connection).createDailyPost(users[1]!, `other-key-${index}`, input),
      ]));

      const fulfilled = results.filter((result) => result.status === "fulfilled");
      const rejected = results.filter((result) => result.status === "rejected");
      expect(new Set(fulfilled.map((result) => result.value.post.id)).size).toBe(1);
      expect(fulfilled.filter((result) => !result.value.replayed)).toHaveLength(1);
      for (const failure of rejected) {
        expect(failure.reason).toBeInstanceOf(CreateDailyPostError);
        expect((failure.reason as CreateDailyPostError).reason).toBe("ALREADY_POSTED");
      }
      const [row] = await migrator.db.select({ count: count() })
        .from(schema.posts)
        .where(eq(schema.posts.authorId, users[1]!));
      expect(row?.count).toBe(1);
    } finally {
      await Promise.all(connections.map((connection) => connection.close()));
    }
  });

  it("rejects a changed payload under a used key without writing", async () => {
    await expect(service().createDailyPost(users[0]!, "key-1", { ...input, rating: 2 }))
      .rejects.toMatchObject({ reason: "IDEMPOTENCY_KEY_REUSED" });
    const [row] = await migrator.db.select({ rating: schema.posts.rating })
      .from(schema.posts)
      .where(eq(schema.posts.authorId, users[0]!));
    expect(row?.rating).toBe(7);
  });

  it("rejects the wrong prompt and leaves no partial rows", async () => {
    await expect(service().createDailyPost(users[2]!, "key-1", { ...input, promptId: "prompt-09-24" }))
      .rejects.toMatchObject({ reason: "PROMPT_CHANGED" });
    const [row] = await migrator.db.select({
      posts: sql<number>`(select count(*) from ${schema.posts} where ${schema.posts.authorId} = ${users[2]!})::int`,
      keys: sql<number>`(select count(*) from ${schema.postIdempotencyKeys} where ${schema.postIdempotencyKeys.authorId} = ${users[2]!})::int`,
    }).from(sql`(values (1)) as query_source`);
    expect(row).toEqual({ posts: 0, keys: 0 });
  });
});
