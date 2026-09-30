import { createDayliDatabase } from "@dayli/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPostgresPostDetailRepository } from "./get-post.repository";

const migratorUrl = process.env.TEST_DATABASE_URL;
const appUrl = process.env.TEST_APP_DATABASE_URL;
const enabled = Boolean(migratorUrl && appUrl && process.env.POSTS_POSTGRES_TEST === "1");

function requireLocalTestUrl(value: string): string {
  const url = new URL(value);
  if (url.hostname !== "localhost" || url.port !== "5433" || url.pathname !== "/dayli_test") {
    throw new Error("Post detail tests must target localhost:5433/dayli_test.");
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
    await migrator.client`
      insert into public.posts (id, author_id, local_date, prompt_id, reflective_answer, caption, rating, audience, accepted_at, released_at)
      values (${id(key)}, ${users.author}, ${localDate}, ${`prompt-${localDate.slice(5)}`}, ${`Answer ${key}`}, 'Sunset', 8,
        ${audience}, ${`${localDate}T03:00:00.000Z`}, ${released ? `${localDate}T12:00:00.000Z` : "2026-09-26T12:00:00.000Z"})
    `;
  }

  async function befriend(other: string, state: "active" | "ended") {
    const changedAt = now.toISOString();
    await migrator.client`
      insert into public.friendships (user_id, friend_id, state, state_changed_at)
      values (${users.author}, ${other}, ${state}, ${changedAt}), (${other}, ${users.author}, ${state}, ${changedAt})
    `;
  }

  beforeAll(async () => {
    for (const [key, userId] of Object.entries(users)) {
      await migrator.client`
        insert into public."user" (id, name, email, username, display_username)
        values (${userId}, ${key}, ${`${userId}@example.test`}, ${`d${run}${key}`.slice(0, 30)}, ${key === "author" ? "The Author" : null})
      `;
    }
    await befriend(users.friend, "active");
    await befriend(users.blocked, "active");
    await befriend(users.ended, "ended");
    await migrator.client`
      insert into public.relationship_blocks (blocker_id, blocked_id, blocked_at)
      values (${users.author}, ${users.blocked}, ${now.toISOString()})
    `;

    await insertPost("released", "2026-09-24", "friends", true);
    await insertPost("solo", "2026-09-23", "solo", true);
    await insertPost("unreleased", "2026-09-26", "friends", false);
    await migrator.client`
      insert into public.post_revisions (id, post_id, revision_number, previous_reflective_answer, previous_rating,
        previous_audience, previous_prompt_id, previous_attachment_refs)
      values (${id("rev-1")}, ${id("released")}, 1, 'Before the edit', 6, 'friends', 'prompt-09-24', '[]'::jsonb)
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
