import { createDayliDatabase } from "@dayli/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { findMoodHistory } from "./get-mood-history.repository";

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
(enabled ? describe : describe.skip)("PostgreSQL mood history", () => {
  const migrator = createDayliDatabase(requireLocalTestUrl(migratorUrl ?? "postgresql://localhost:5433/dayli_test"));
  const app = createDayliDatabase(requireLocalTestUrl(appUrl ?? "postgresql://localhost:5433/dayli_test"));
  const run = crypto.randomUUID().replaceAll("-", "").slice(0, 8);
  const id = (name: string) => `mood-${run}-${name}`;
  const users = { owner: id("owner"), imported: id("imported"), other: id("other") };
  const userIds = Object.values(users);
  // 3pm on 30 September in Auckland.
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
        values (${userId}, ${key}, ${`${userId}@example.test`}, ${`m${run}${key}`.slice(0, 30)}, ${createdAt})
      `;
    }
    await post(users.owner, "2026-08-20", 4);
    await post(users.owner, "2026-09-01", 9);
    await post(users.owner, "2026-09-15", 6, { audience: "solo" });
    // Today's post is not released yet but is the owner's own.
    await post(users.owner, "2026-09-30", 7);
    await post(users.owner, "2026-09-20", 1, { deleted: true });
    await post(users.other, "2026-09-25", 10);
    await post(users.imported, "2026-07-01", 5);
  });

  afterAll(async () => {
    try {
      await migrator.client`delete from public.posts where author_id = any(${userIds}::text[])`;
      await migrator.client`delete from public."user" where id = any(${userIds}::text[])`;
    } finally {
      await Promise.all([app.close(), migrator.close()]);
    }
  });

  it("summarises only the caller's live posts, solo and unreleased ones included", async () => {
    const history = await findMoodHistory(app.db, users.owner, "30d", now);

    expect(history?.days).toEqual([
      { localDate: "2026-09-01", rating: 9 },
      { localDate: "2026-09-15", rating: 6 },
      { localDate: "2026-09-30", rating: 7 },
    ]);
    expect(history?.trackedFrom).toBe("2026-08-05");
    expect(history?.current).toMatchObject({ trackedDays: 30, postedDays: 3, missingDays: 27, average: 7.3, lowest: 6, highest: 9 });
    expect(history?.previous).toMatchObject({ from: "2026-08-02", to: "2026-08-31", trackedDays: 27, postedDays: 1, missingDays: 26, average: 4 });
  });

  it("tracks an imported account from its earliest post", async () => {
    const history = await findMoodHistory(app.db, users.imported, "1y", now);

    expect(history?.trackedFrom).toBe("2026-07-01");
    expect(history?.days).toEqual([{ localDate: "2026-07-01", rating: 5 }]);
  });

  it("is null for an unknown account", async () => {
    await expect(findMoodHistory(app.db, id("missing"), "30d", now)).resolves.toBeNull();
  });
});
