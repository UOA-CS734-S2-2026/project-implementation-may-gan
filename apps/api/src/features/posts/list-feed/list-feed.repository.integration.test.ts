import { createDayliDatabase } from "@dayli/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPostgresFeedRepository, InvalidFeedCursorError } from "./list-feed.repository";

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
    await migrator.client`
      insert into public.posts (id, author_id, local_date, prompt_id, reflective_answer, rating, audience, accepted_at, released_at)
      values (${id(key)}, ${authorId}, ${localDate}, ${`prompt-${localDate.slice(5)}`}, ${`Answer ${key}`}, 7,
        ${options.audience ?? "friends"}, ${acceptedAt}, ${releasedAt})
    `;
  }

  /** The database requires both directional rows, with the same state, in one statement. */
  async function befriend(a: string, b: string, state: "active" | "ended" = "active") {
    const changedAt = now.toISOString();
    await migrator.client`
      insert into public.friendships (user_id, friend_id, state, state_changed_at)
      values (${a}, ${b}, ${state}, ${changedAt}), (${b}, ${a}, ${state}, ${changedAt})
    `;
  }

  beforeAll(async () => {
    for (const [key, userId] of Object.entries(users)) {
      const username = key === "noUsername" ? null : `f${run}${key.toLowerCase()}`.slice(0, 30);
      await migrator.client`
        insert into public."user" (id, name, email, username, display_username)
        values (${userId}, ${key}, ${`${userId}@example.test`}, ${username}, ${key === "friendA" ? "Friend A" : null})
      `;
    }

    await befriend(users.viewer, users.friendA);
    await befriend(users.viewer, users.friendB);
    await befriend(users.viewer, users.blocked);
    await befriend(users.viewer, users.blocker);
    await befriend(users.viewer, users.noUsername);
    await befriend(users.viewer, users.ended, "ended");
    await migrator.client`
      insert into public.relationship_blocks (blocker_id, blocked_id, blocked_at)
      values (${users.viewer}, ${users.blocked}, ${now.toISOString()}), (${users.blocker}, ${users.viewer}, ${now.toISOString()})
    `;

    // Visible: friends posts released before the friendship's state changed are
    // still part of the shared history.
    await insertPost("a-20", users.friendA, "2026-09-20");
    await insertPost("a-22", users.friendA, "2026-09-22");
    await insertPost("b-22", users.friendB, "2026-09-22");
    await insertPost("b-24", users.friendB, "2026-09-24");
    // Hidden.
    await insertPost("a-21-solo", users.friendA, "2026-09-21", { audience: "solo" });
    await insertPost("a-26-unreleased", users.friendA, "2026-09-26", { released: false });
    await insertPost("viewer-25", users.viewer, "2026-09-25");
    await insertPost("stranger-25", users.stranger, "2026-09-25");
    await insertPost("ended-25", users.ended, "2026-09-25");
    await insertPost("blocked-25", users.blocked, "2026-09-25");
    await insertPost("blocker-25", users.blocker, "2026-09-25");
    await insertPost("no-username-25", users.noUsername, "2026-09-25");

    await migrator.client`
      insert into public.post_revisions (id, post_id, revision_number, previous_reflective_answer, previous_rating,
        previous_audience, previous_prompt_id, previous_attachment_refs)
      values (${id("rev-1")}, ${id("b-24")}, 1, 'Before the edit', 6, 'friends', 'prompt-09-24', '[]'::jsonb)
    `;
  });

  afterAll(async () => {
    try {
      await migrator.client`delete from public.post_revisions where post_id in (select id from public.posts where author_id = any(${userIds}::text[]))`;
      await migrator.client`delete from public.posts where author_id = any(${userIds}::text[])`;
      await migrator.client`delete from public.relationship_blocks where blocker_id = any(${userIds}::text[])`;
      await migrator.client`delete from public.friendships where user_id = any(${userIds}::text[])`;
      await migrator.client`delete from public."user" where id = any(${userIds}::text[])`;
    } finally {
      await Promise.all([app.close(), migrator.close()]);
    }
  });

  it("lists only released friends posts by active, unblocked friends", async () => {
    const page = await feed().listFeed(users.viewer, now, 20);

    expect(page.items.map((post) => post.id)).toEqual([id("b-24"), id("b-22"), id("a-22"), id("a-20")]);
    expect(page).toMatchObject({ hasMore: false, nextCursor: null });
  });

  it("projects the author, prompt, and edited marker", async () => {
    const page = await feed().listFeed(users.viewer, now, 20);
    const [edited, , friendA] = page.items;

    expect(edited).toMatchObject({ id: id("b-24"), edited: true, audience: "friends" });
    expect(friendA).toEqual({
      id: id("a-22"),
      author: { id: users.friendA, username: `f${run}frienda`.slice(0, 30), displayName: "Friend A" },
      localDate: "2026-09-22",
      prompt: { id: "prompt-09-22", text: expect.any(String) },
      reflectiveAnswer: "Answer a-22",
      caption: null,
      rating: 7,
      audience: "friends",
      acceptedAt: "2026-09-22T03:00:00.000Z",
      releasedAt: "2026-09-22T12:00:00.000Z",
      edited: false,
    });
  });

  it("pages deterministically without repeating or skipping posts", async () => {
    const first = await feed().listFeed(users.viewer, now, 2);
    expect(first.items.map((post) => post.id)).toEqual([id("b-24"), id("b-22")]);
    expect(first.hasMore).toBe(true);

    const second = await feed().listFeed(users.viewer, now, 2, first.nextCursor!);
    expect(second.items.map((post) => post.id)).toEqual([id("a-22"), id("a-20")]);
    expect(second).toMatchObject({ hasMore: false, nextCursor: null });
  });

  it("shows a post once its release time passes", async () => {
    const afterMidnight = await feed().listFeed(users.viewer, new Date("2026-09-26T12:00:00.000Z"), 1);

    expect(afterMidnight.items.map((post) => post.id)).toEqual([id("a-26-unreleased")]);
  });

  it("never shows a friend's feed to the stranger", async () => {
    const page = await feed().listFeed(users.stranger, now, 20);

    expect(page.items).toEqual([]);
  });

  it("rejects an unreadable cursor", async () => {
    await expect(feed().listFeed(users.viewer, now, 20, "not-a-cursor")).rejects.toBeInstanceOf(InvalidFeedCursorError);
    const impossibleDate = btoa(JSON.stringify(["2026-99-99", id("b-24")])).replaceAll("=", "");
    await expect(feed().listFeed(users.viewer, now, 20, impossibleDate)).rejects.toBeInstanceOf(InvalidFeedCursorError);
  });
});
