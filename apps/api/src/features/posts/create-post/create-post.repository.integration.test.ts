import { createDayliDatabase } from "@dayli/db";
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
  const users = Array.from({ length: 3 }, (_, index) => `post-create-${crypto.randomUUID()}-${index}`);
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
    await migrator.client`
      insert into public."user" (id, name, email)
      select id, id, id || '@example.test' from unnest(${users}::text[]) as ids(id)
    `;
  });

  afterAll(async () => {
    try {
      // Immutable post history may only be removed by the migrator cleanup role.
      await migrator.client`delete from public.tomorrow_notes where author_id = any(${users}::text[])`;
      await migrator.client`delete from public.posts where author_id = any(${users}::text[])`;
      await migrator.client`delete from public."user" where id = any(${users}::text[])`;
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

    const [row] = await migrator.client`
      select
        (select count(*)::int from public.posts where author_id = ${users[0]!}) as posts,
        (select count(*)::int from public.tomorrow_notes where author_id = ${users[0]!}) as notes,
        (select count(*)::int from public.post_idempotency_keys where author_id = ${users[0]!}) as keys
    `;
    expect(row).toEqual({ posts: 1, notes: 1, keys: 1 });
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
      const [row] = await migrator.client`select count(*)::int as count from public.posts where author_id = ${users[1]!}`;
      expect(row?.count).toBe(1);
    } finally {
      await Promise.all(connections.map((connection) => connection.close()));
    }
  });

  it("rejects a changed payload under a used key without writing", async () => {
    await expect(service().createDailyPost(users[0]!, "key-1", { ...input, rating: 2 }))
      .rejects.toMatchObject({ reason: "IDEMPOTENCY_KEY_REUSED" });
    const [row] = await migrator.client`select rating from public.posts where author_id = ${users[0]!}`;
    expect(row?.rating).toBe(7);
  });

  it("rejects the wrong prompt and leaves no partial rows", async () => {
    await expect(service().createDailyPost(users[2]!, "key-1", { ...input, promptId: "prompt-09-24" }))
      .rejects.toMatchObject({ reason: "PROMPT_CHANGED" });
    const [row] = await migrator.client`
      select
        (select count(*)::int from public.posts where author_id = ${users[2]!}) as posts,
        (select count(*)::int from public.post_idempotency_keys where author_id = ${users[2]!}) as keys
    `;
    expect(row).toEqual({ posts: 0, keys: 0 });
  });
});
