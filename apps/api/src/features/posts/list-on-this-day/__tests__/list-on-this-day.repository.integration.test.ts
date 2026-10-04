import { createDayliDatabase } from "@dayli/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../../../../app";
import { createPostgresOnThisDayRepository } from "../list-on-this-day.repository";

const migratorUrl = process.env.TEST_DATABASE_URL;
const appUrl = process.env.TEST_APP_DATABASE_URL;
const enabled = Boolean(migratorUrl && appUrl && process.env.POSTS_POSTGRES_TEST === "1");
const testPostgresPort = process.env.VERIFY_POSTGRES_PORT ?? "5433";

function requireLocalTestUrl(value: string): string {
  const url = new URL(value);
  if (url.hostname !== "localhost" || url.port !== testPostgresPort || url.pathname !== "/dayli_test") {
    throw new Error(`On This Day tests must target localhost:${testPostgresPort}/dayli_test.`);
  }
  return value;
}

interface Memories {
  date: string;
  items: Array<{ id: string; localDate: string; yearsAgo: number; audience: string; reflectiveAnswer: string; caption: string | null }>;
}

/**
 * Reads run through the restricted app role, as the Worker does, and through
 * the real route so the fixed clock decides "today" the way a request does.
 * Fixture rows are synthetic, unique per run, and removed afterwards.
 */
(enabled ? describe : describe.skip)("PostgreSQL On This Day memories", () => {
  const migrator = createDayliDatabase(requireLocalTestUrl(migratorUrl ?? "postgresql://localhost:5433/dayli_test"));
  const app = createDayliDatabase(requireLocalTestUrl(appUrl ?? "postgresql://localhost:5433/dayli_test"));
  const run = crypto.randomUUID().replaceAll("-", "").slice(0, 10);
  const id = (name: string) => `otd-${run}-${name}`;
  const users = {
    owner: id("owner"),
    friend: id("friend"),
    leaver: id("leaver"),
    empty: id("empty"),
  };
  const userIds = Object.values(users);
  const handle = (key: keyof typeof users) => `o${run}${key}`.slice(0, 30);
  const repository = createPostgresOnThisDayRepository(app.db);

  /** Auckland is UTC+13 in September and February, so these instants differ from the UTC date. */
  const clocks = {
    // 01:00 on 27 Sep 2027 in Auckland; still 26 Sep in UTC.
    sep27: new Date("2027-09-26T12:00:00.000Z"),
    // 23:59 on 26 Sep 2027 in Auckland, one minute before the day above begins.
    sep26: new Date("2027-09-26T10:59:00.000Z"),
    feb27: new Date("2027-02-27T05:00:00.000Z"),
    feb28: new Date("2027-02-28T05:00:00.000Z"),
    mar01: new Date("2027-03-01T05:00:00.000Z"),
    // 00:30 on 29 Feb 2028 in Auckland; still 28 Feb in UTC.
    leapDay: new Date("2028-02-28T11:30:00.000Z"),
    // 18:00 on 29 Feb 2028 in Auckland and UTC 05:00 the same day.
    leapDayEvening: new Date("2028-02-29T05:00:00.000Z"),
    mar01Leap: new Date("2028-03-01T05:00:00.000Z"),
  };

  async function memories(userId: string, now: Date): Promise<Memories> {
    const response = await createApp({
      onThisDay: {
        resolveSession: async () => ({ userId }),
        hasUsername: async () => true,
        repository,
        now: () => now,
      },
    }).request("/api/v1/me/memories/on-this-day");
    expect(response.status).toBe(200);
    return response.json<Memories>();
  }

  async function insertPost(
    key: string,
    authorId: string,
    localDate: string,
    options: { audience?: "solo" | "friends"; caption?: string | null; acceptedAt?: string; releasedAt?: string; trashed?: "trash" | "pending-purge" } = {},
  ) {
    const acceptedAt = options.acceptedAt ?? `${localDate}T03:00:00.000Z`;
    const releasedAt = options.releasedAt ?? `${localDate}T12:00:00.000Z`;
    await migrator.client`
      insert into public.posts (id, author_id, local_date, prompt_id, reflective_answer, caption, rating, audience, accepted_at, released_at)
      values (${id(key)}, ${authorId}, ${localDate}, ${`prompt-${localDate.slice(5)}`}, ${`Answer ${key}`}, ${options.caption ?? null}, 7,
        ${options.audience ?? "friends"}, ${acceptedAt}, ${releasedAt})
    `;
    if (options.trashed) {
      await migrator.client`
        update public.posts set
          trashed_at = ${acceptedAt}::timestamptz,
          restore_until = ${acceptedAt}::timestamptz + interval '168 hours',
          trash_purge_due_at = ${acceptedAt}::timestamptz + interval '336 hours'
        where id = ${id(key)}
      `;
      if (options.trashed === "pending-purge") {
        await migrator.client`
          update public.posts set trash_lease_token = 'lease', trash_lease_expires_at = ${acceptedAt}::timestamptz + interval '400 hours'
          where id = ${id(key)}
        `;
      }
    }
  }

  beforeAll(async () => {
    for (const [key, userId] of Object.entries(users)) {
      await migrator.client`
        insert into public."user" (id, name, email, username)
        values (${userId}, ${key}, ${`${userId}@example.test`}, ${handle(key as keyof typeof users)})
      `;
    }
    const changedAt = clocks.sep27.toISOString();
    await migrator.client`
      insert into public.friendships (user_id, friend_id, state, state_changed_at)
      values (${users.owner}, ${users.friend}, 'active', ${changedAt}), (${users.friend}, ${users.owner}, 'active', ${changedAt})
    `;

    // 27 September memories, plus every kind of post that must stay out.
    await insertPost("2026-09-27", users.owner, "2026-09-27", { caption: "Harbour" });
    await insertPost("2025-09-27-solo", users.owner, "2025-09-27", { audience: "solo" });
    await insertPost("2024-09-27", users.owner, "2024-09-27");
    await insertPost("2023-09-27-trash", users.owner, "2023-09-27", { trashed: "trash" });
    await insertPost("2022-09-27-purge", users.owner, "2022-09-27", { trashed: "pending-purge" });
    await insertPost("2021-09-27-unreleased", users.owner, "2021-09-27", { releasedAt: "2027-09-27T12:00:00.000Z" });
    await insertPost("2026-09-26", users.owner, "2026-09-26");
    await insertPost("2026-09-28", users.owner, "2026-09-28");
    // The current year is never a memory, even when it is released.
    await insertPost("2027-09-27-today", users.owner, "2027-09-27", { acceptedAt: "2027-09-26T11:30:00.000Z", releasedAt: "2027-09-26T11:45:00.000Z" });
    // A friend's released friends posts on the same dates are visible to the owner elsewhere, but never here.
    await insertPost("friend-2026-09-27", users.friend, "2026-09-27");
    await insertPost("friend-2025-09-27", users.friend, "2025-09-27");
    // A solo post by the same friend.
    await insertPost("friend-2024-09-27-solo", users.friend, "2024-09-27", { audience: "solo" });

    // Leap-day fixtures.
    await insertPost("2024-02-28", users.owner, "2024-02-28");
    await insertPost("2024-02-29", users.owner, "2024-02-29");
    await insertPost("2024-03-01", users.owner, "2024-03-01");
    await insertPost("2020-02-29", users.owner, "2020-02-29", { audience: "solo" });
    await insertPost("2027-02-28", users.owner, "2027-02-28");
    await insertPost("2027-03-01", users.owner, "2027-03-01");

    // A post by an account that has asked to be deleted.
    await insertPost("leaver-2026-09-27", users.leaver, "2026-09-27");
    await migrator.client`
      insert into public.account_lifecycles (user_id, state, request_id, idempotency_key_digest, requested_at, cancel_until, purge_due_at)
      values (${users.leaver}, 'pending_deletion', ${id("deletion")}, ${"a".repeat(64)}, ${changedAt}::timestamptz,
        ${changedAt}::timestamptz + interval '168 hours', ${changedAt}::timestamptz + interval '336 hours')
    `;

    await migrator.client`
      insert into public.post_revisions (id, post_id, revision_number, previous_reflective_answer, previous_rating,
        previous_audience, previous_prompt_id, previous_attachment_refs)
      values (${id("rev-1")}, ${id("2024-09-27")}, 1, 'Before the edit', 6, 'friends', 'prompt-09-27', '[]'::jsonb)
    `;
  });

  afterAll(async () => {
    try {
      await migrator.client`delete from public.post_revisions where post_id in (select id from public.posts where author_id = any(${userIds}::text[]))`;
      await migrator.client`delete from public.account_lifecycles where user_id = any(${userIds}::text[])`;
      await migrator.client`delete from public.posts where author_id = any(${userIds}::text[])`;
      await migrator.client`delete from public.friendships where user_id = any(${userIds}::text[])`;
      await migrator.client`delete from public."user" where id = any(${userIds}::text[])`;
    } finally {
      await Promise.all([app.close(), migrator.close()]);
    }
  });

  it("returns the owner's own posts from earlier years, newest year first, solo and friends alike", async () => {
    const result = await memories(users.owner, clocks.sep27);

    expect(result.date).toBe("2027-09-27");
    expect(result.items.map((item) => [item.id, item.localDate, item.yearsAgo, item.audience])).toEqual([
      [id("2026-09-27"), "2026-09-27", 1, "friends"],
      [id("2025-09-27-solo"), "2025-09-27", 2, "solo"],
      [id("2024-09-27"), "2024-09-27", 3, "friends"],
    ]);
  });

  it("projects the current content, caption, prompt, rating and edited marker", async () => {
    const result = await memories(users.owner, clocks.sep27);

    expect(result.items[0]).toEqual({
      id: id("2026-09-27"),
      localDate: "2026-09-27",
      yearsAgo: 1,
      rating: 7,
      audience: "friends",
      prompt: { id: "prompt-09-27", text: expect.any(String) },
      reflectiveAnswer: "Answer 2026-09-27",
      caption: "Harbour",
      edited: false,
      media: [],
    });
    expect(result.items.map((item) => item.id)).toContain(id("2024-09-27"));
    expect(result.items.find((item) => item.id === id("2024-09-27"))).toMatchObject({ edited: true });
  });

  it("never includes another user's posts, even a friend's released friends post on the same date", async () => {
    const result = await memories(users.owner, clocks.sep27);
    const ids = result.items.map((item) => item.id);

    expect(ids).not.toContain(id("friend-2026-09-27"));
    expect(ids).not.toContain(id("friend-2025-09-27"));
    expect(ids).not.toContain(id("friend-2024-09-27-solo"));

    // The friend sees only their own posts, not the owner's, which they could otherwise read.
    const friend = await memories(users.friend, clocks.sep27);
    expect(friend.items.map((item) => item.id)).toEqual([id("friend-2026-09-27"), id("friend-2025-09-27"), id("friend-2024-09-27-solo")]);
  });

  it("excludes the current year", async () => {
    const result = await memories(users.owner, clocks.sep27);

    expect(result.items.map((item) => item.localDate)).not.toContain("2027-09-27");
  });

  it("excludes posts in Trash, posts awaiting purge, and posts that are not released yet", async () => {
    const result = await memories(users.owner, clocks.sep27);
    const ids = result.items.map((item) => item.id);

    expect(ids).not.toContain(id("2023-09-27-trash"));
    expect(ids).not.toContain(id("2022-09-27-purge"));
    expect(ids).not.toContain(id("2021-09-27-unreleased"));
  });

  it("returns nothing for an account that is pending deletion", async () => {
    await expect(memories(users.leaver, clocks.sep27)).resolves.toEqual({ date: "2027-09-27", items: [] });
  });

  it("returns an empty list for a user with no memories", async () => {
    await expect(memories(users.empty, clocks.sep27)).resolves.toEqual({ date: "2027-09-27", items: [] });
  });

  it("uses the Auckland date, not the UTC date", async () => {
    // Both instants are 26 September in UTC.
    const beforeMidnight = await memories(users.owner, clocks.sep26);
    expect(beforeMidnight.date).toBe("2027-09-26");
    expect(beforeMidnight.items.map((item) => item.id)).toEqual([id("2026-09-26")]);

    const afterMidnight = await memories(users.owner, clocks.sep27);
    expect(afterMidnight.date).toBe("2027-09-27");
    expect(afterMidnight.items.map((item) => item.localDate)).toEqual(["2026-09-27", "2025-09-27", "2024-09-27"]);
  });

  it("skips a 29 February post in a non-leap year without rolling it to 28 February or 1 March", async () => {
    const feb27 = await memories(users.owner, clocks.feb27);
    expect(feb27).toEqual({ date: "2027-02-27", items: [] });

    const feb28 = await memories(users.owner, clocks.feb28);
    expect(feb28.items.map((item) => item.localDate)).toEqual(["2024-02-28"]);

    const mar01 = await memories(users.owner, clocks.mar01);
    expect(mar01.items.map((item) => item.localDate)).toEqual(["2024-03-01"]);
  });

  it("returns a 29 February post only on a later 29 February", async () => {
    // 00:30 on 29 February in Auckland while UTC is still 28 February.
    const leapDay = await memories(users.owner, clocks.leapDay);
    expect(leapDay.date).toBe("2028-02-29");
    expect(leapDay.items.map((item) => [item.localDate, item.yearsAgo, item.audience])).toEqual([
      ["2024-02-29", 4, "friends"],
      ["2020-02-29", 8, "solo"],
    ]);

    const evening = await memories(users.owner, clocks.leapDayEvening);
    expect(evening.items.map((item) => item.localDate)).toEqual(["2024-02-29", "2020-02-29"]);

    // The previous and following days in the leap year match their own dates only.
    const mar01 = await memories(users.owner, clocks.mar01Leap);
    expect(mar01.items.map((item) => item.localDate)).toEqual(["2027-03-01", "2024-03-01"]);
  });

  it("holds at most one memory per year", async () => {
    const result = await memories(users.owner, clocks.sep27);
    const years = result.items.map((item) => item.localDate.slice(0, 4));

    expect(new Set(years).size).toBe(years.length);
  });

  it("reads author and day pairs, the shape of the active-post index", async () => {
    // A fixture table is too small for the planner to prefer an index, so only rule out a sequential scan.
    const plan = await migrator.client.begin(async (transaction) => {
      await transaction`set local enable_seqscan = off`;
      return transaction`
        explain (format json)
        select id from public.posts
        where author_id = ${users.owner} and local_date = any(array['2026-09-27', '2025-09-27']::date[]) and trashed_at is null
      `;
    });

    expect(JSON.stringify(plan)).toContain("posts_author_local_date_active_unique");
  });
});
