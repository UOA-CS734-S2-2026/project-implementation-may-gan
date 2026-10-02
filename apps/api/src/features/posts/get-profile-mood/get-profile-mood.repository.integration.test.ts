import { createDayliDatabase } from "@dayli/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { findProfileMood } from "./get-profile-mood.repository";

const migratorUrl = process.env.TEST_DATABASE_URL;
const appUrl = process.env.TEST_APP_DATABASE_URL;
const enabled = Boolean(migratorUrl && appUrl && process.env.POSTS_POSTGRES_TEST === "1");
const testPostgresPort = process.env.VERIFY_POSTGRES_PORT ?? "5433";

function requireLocalTestUrl(value: string): string {
  const url = new URL(value);
  if (url.hostname !== "localhost" || url.port !== testPostgresPort || url.pathname !== "/dayli_test") {
    throw new Error(`Mood history tests must target localhost:${testPostgresPort}/dayli_test.`);
  }
  return value;
}

/**
 * Reads run through the restricted app role, as the Worker does. Fixture rows
 * are written by the migrator, are unique per run, and are removed afterwards.
 */
(enabled ? describe : describe.skip)("PostgreSQL profile mood", () => {
  const migrator = createDayliDatabase(requireLocalTestUrl(migratorUrl ?? "postgresql://localhost:5433/dayli_test"));
  const app = createDayliDatabase(requireLocalTestUrl(appUrl ?? "postgresql://localhost:5433/dayli_test"));
  const run = crypto.randomUUID().replaceAll("-", "").slice(0, 8);
  const id = (name: string) => `mood-${run}-${name}`;
  const users = { owner: id("owner"), friend: id("friend"), stranger: id("stranger"), blocked: id("blocked"), imported: id("imported") };
  const handle = (key: keyof typeof users) => `m${run}${key}`.slice(0, 30);
  const userIds = Object.values(users);
  // 3pm on 30 September in Auckland, before that day's posts are released.
  const now = new Date("2026-09-30T03:00:00.000Z");

  async function post(authorId: string, localDate: string, rating: number, options: { audience?: "solo" | "friends"; deleted?: boolean } = {}) {
    await migrator.client`
      insert into public.posts (id, author_id, local_date, prompt_id, reflective_answer, rating, audience, accepted_at, released_at, deleted_at)
      values (${id(`${authorId}-${localDate}-${rating}`)}, ${authorId}, ${localDate}, ${`prompt-${localDate.slice(5)}`}, 'An answer', ${rating},
        ${options.audience ?? "friends"}, ${`${localDate}T03:00:00.000Z`}, ${`${localDate}T12:00:00.000Z`},
        ${options.deleted ? `${localDate}T04:00:00.000Z` : null})
    `;
  }

  beforeAll(async () => {
    for (const [key, userId] of Object.entries(users)) {
      // The owner joined on 5 August in Auckland; the imported account's row is newer than its posts.
      const createdAt = key === "imported" ? "2026-09-20T00:00:00.000Z" : "2026-08-04T20:00:00.000Z";
      await migrator.client`
        insert into public."user" (id, name, email, username, created_at)
        values (${userId}, ${key}, ${`${userId}@example.test`}, ${handle(key as keyof typeof users)}, ${createdAt})
      `;
    }
    const changedAt = now.toISOString();
    await migrator.client`
      insert into public.friendships (user_id, friend_id, state, state_changed_at)
      values (${users.owner}, ${users.friend}, 'active', ${changedAt}), (${users.friend}, ${users.owner}, 'active', ${changedAt})
    `;
    await migrator.client`
      insert into public.relationship_blocks (blocker_id, blocked_id, blocked_at)
      values (${users.owner}, ${users.blocked}, ${changedAt})
    `;
    await post(users.owner, "2026-08-20", 4);
    await post(users.owner, "2026-09-01", 9);
    await post(users.owner, "2026-09-15", 6, { audience: "solo" });
    // Today's post is not released yet.
    await post(users.owner, "2026-09-30", 7);
    await post(users.owner, "2026-09-20", 1, { deleted: true });
    await post(users.friend, "2026-09-25", 10);
    await post(users.imported, "2026-07-01", 5);
  });

  afterAll(async () => {
    try {
      await migrator.client`delete from public.posts where author_id = any(${userIds}::text[])`;
      await migrator.client`delete from public.relationship_blocks where blocker_id = any(${userIds}::text[])`;
      await migrator.client`delete from public.friendships where user_id = any(${userIds}::text[])`;
      await migrator.client`delete from public."user" where id = any(${userIds}::text[])`;
    } finally {
      await Promise.all([app.close(), migrator.close()]);
    }
  });

  it("shows the owner every live post, solo and unreleased ones included", async () => {
    const outcome = await findProfileMood(app.db, users.owner, handle("owner"), "30d", now);
    if (outcome.kind !== "found") throw new Error(`expected found, got ${outcome.kind}`);

    expect(outcome.history.days).toEqual([
      { localDate: "2026-09-01", rating: 9 },
      { localDate: "2026-09-15", rating: 6 },
      { localDate: "2026-09-30", rating: 7 },
    ]);
    expect(outcome.history.hiddenDays).toEqual([]);
    expect(outcome.history.trackedFrom).toBe("2026-08-05");
    expect(outcome.history.current).toMatchObject({ trackedDays: 30, postedDays: 3, missingDays: 27, average: 7.3 });
    expect(outcome.history.previous).toMatchObject({ from: "2026-08-02", to: "2026-08-31", trackedDays: 27, postedDays: 1, average: 4 });
  });

  it("shows a friend released friends posts, with solo and unreleased days unrated but not missing", async () => {
    const outcome = await findProfileMood(app.db, users.friend, handle("owner"), "30d", now);
    if (outcome.kind !== "found") throw new Error(`expected found, got ${outcome.kind}`);

    expect(outcome.history.days).toEqual([{ localDate: "2026-09-01", rating: 9 }]);
    expect(outcome.history.hiddenDays).toEqual(["2026-09-15", "2026-09-30"]);
    expect(outcome.history.current).toMatchObject({ postedDays: 1, missingDays: 27, average: 9 });
  });

  it("is forbidden to anyone else and not found when blocked or unknown", async () => {
    await expect(findProfileMood(app.db, users.stranger, handle("owner"), "30d", now)).resolves.toEqual({ kind: "forbidden" });
    await expect(findProfileMood(app.db, users.blocked, handle("owner"), "30d", now)).resolves.toEqual({ kind: "notFound" });
    await expect(findProfileMood(app.db, users.owner, "nobody_here", "30d", now)).resolves.toEqual({ kind: "notFound" });
  });

  it("tracks an imported account from its earliest post", async () => {
    const outcome = await findProfileMood(app.db, users.imported, handle("imported"), "1y", now);
    if (outcome.kind !== "found") throw new Error(`expected found, got ${outcome.kind}`);

    expect(outcome.history.trackedFrom).toBe("2026-07-01");
    expect(outcome.history.days).toEqual([{ localDate: "2026-07-01", rating: 5 }]);
  });
});
