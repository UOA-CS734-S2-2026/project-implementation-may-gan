import { createDayliDatabase } from "@dayli/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { InvalidPostCursorError } from "../shared/post-page-cursor";
import {
  createPostgresProfilePostsRepository,
  type ProfilePostsPageRecord,
  type ReadableProfilePostsRecord,
} from "./list-profile-posts.repository";

function fullPage(page: ReadableProfilePostsRecord | null): ProfilePostsPageRecord {
  if (!page || "kind" in page) throw new Error("Expected a readable profile archive page.");
  return page;
}

const migratorUrl = process.env.TEST_DATABASE_URL;
const appUrl = process.env.TEST_APP_DATABASE_URL;
const enabled = Boolean(migratorUrl && appUrl && process.env.POSTS_POSTGRES_TEST === "1");
const testPostgresPort = process.env.VERIFY_POSTGRES_PORT ?? "5433";

function requireLocalTestUrl(value: string): string {
  const url = new URL(value);
  if (url.hostname !== "localhost" || url.port !== testPostgresPort || url.pathname !== "/dayli_test") {
    throw new Error(`Profile post tests must target localhost:${testPostgresPort}/dayli_test.`);
  }
  return value;
}

/**
 * Reads run through the restricted app role, as the Worker does. Fixture rows
 * are written by the migrator, are unique per run, and are removed afterwards.
 */
(enabled ? describe : describe.skip)("PostgreSQL profile posts", () => {
  const migrator = createDayliDatabase(requireLocalTestUrl(migratorUrl ?? "postgresql://localhost:5433/dayli_test"));
  const app = createDayliDatabase(requireLocalTestUrl(appUrl ?? "postgresql://localhost:5433/dayli_test"));
  const run = crypto.randomUUID().replaceAll("-", "").slice(0, 10);
  const id = (name: string) => `profile-${run}-${name}`;
  const users = {
    owner: id("owner"),
    publicOwner: id("public-owner"),
    friend: id("friend"),
    stranger: id("stranger"),
    ended: id("ended"),
    blocked: id("blocked"),
    banned: id("banned"),
  };
  const handle = (key: keyof typeof users) => `p${run}${key}`.slice(0, 30);
  const userIds = Object.values(users);
  const now = new Date("2026-09-26T03:00:00.000Z");
  const profiles = () => createPostgresProfilePostsRepository(app.db);

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
      await migrator.client`
        insert into public."user" (id, name, email, username, display_username, banned, profile_visibility)
        values (${userId}, ${key}, ${`${userId}@example.test`}, ${handle(key as keyof typeof users)},
          ${key === "owner" ? "The Owner" : null}, ${key === "banned"}, ${key === "publicOwner" ? "public" : "private"})
      `;
    }

    await befriend(users.owner, users.friend);
    await befriend(users.owner, users.blocked);
    await befriend(users.owner, users.banned);
    await befriend(users.owner, users.ended, "ended");
    await migrator.client`
      insert into public.relationship_blocks (blocker_id, blocked_id, blocked_at)
      values (${users.owner}, ${users.blocked}, ${now.toISOString()})
    `;

    await insertPost("20", users.owner, "2026-09-20");
    await insertPost("21-solo", users.owner, "2026-09-21", { audience: "solo" });
    await insertPost("22", users.owner, "2026-09-22");
    await insertPost("24", users.owner, "2026-09-24");
    await insertPost("26-unreleased", users.owner, "2026-09-26", { released: false });
    await insertPost("friend-25", users.friend, "2026-09-25");
    await insertPost("banned-25", users.banned, "2026-09-25");
    await insertPost("public-20", users.publicOwner, "2026-09-20");
    await insertPost("public-21-solo", users.publicOwner, "2026-09-21", { audience: "solo" });
    await insertPost("public-22", users.publicOwner, "2026-09-22");
    await insertPost("public-24", users.publicOwner, "2026-09-24");
    await insertPost("public-26-unreleased", users.publicOwner, "2026-09-26", { released: false });

    await migrator.client`
      insert into public.post_revisions (id, post_id, revision_number, previous_reflective_answer, previous_rating,
        previous_audience, previous_prompt_id, previous_attachment_refs)
      values (${id("rev-1")}, ${id("24")}, 1, 'Before the edit', 6, 'friends', 'prompt-09-24', '[]'::jsonb)
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

  it("shows the owner every post, including solo and unreleased ones", async () => {
    const page = fullPage(await profiles().listProfilePosts(users.owner, handle("owner"), now, 20));

    expect(page.accessTier).toBe("authorized");
    expect(page.items.map((post) => post.id)).toEqual([id("26-unreleased"), id("24"), id("22"), id("21-solo"), id("20")]);
    expect(page?.items.map((post) => [post.audience, post.released])).toEqual([
      ["friends", false], ["friends", true], ["friends", true], ["solo", true], ["friends", true],
    ]);
  });

  it("shows a friend only released friends posts", async () => {
    const page = fullPage(await profiles().listProfilePosts(users.friend, handle("owner"), now, 20));

    expect(page.accessTier).toBe("authorized");
    expect(page.items.map((post) => post.id)).toEqual([id("24"), id("22"), id("20")]);
  });

  it("projects the author, prompt, and edited marker", async () => {
    const page = fullPage(await profiles().listProfilePosts(users.friend, handle("owner"), now, 20));

    expect(page.items[0]).toEqual({
      id: id("24"),
      author: { id: users.owner, username: handle("owner"), displayName: "The Owner" },
      localDate: "2026-09-24",
      prompt: { id: "prompt-09-24", text: expect.any(String) },
      reflectiveAnswer: "Answer 24",
      caption: null,
      rating: 7,
      audience: "friends",
      acceptedAt: "2026-09-24T03:00:00.000Z",
      releasedAt: "2026-09-24T12:00:00.000Z",
      released: true,
      edited: true,
      likeCount: 0,
      viewerHasLiked: false,
      commentCount: 0,
      media: [],
    });
  });

  it("resolves the handle case-insensitively", async () => {
    const page = fullPage(await profiles().listProfilePosts(users.friend, handle("owner").toUpperCase(), now, 1));

    expect(page?.items.map((post) => post.id)).toEqual([id("24")]);
  });

  it("gives a private non-friend only the username and restricted state", async () => {
    await expect(profiles().listProfilePosts(null, handle("owner"), now, 20))
      .resolves.toEqual({ kind: "restricted", username: handle("owner") });
    await expect(profiles().listProfilePosts(users.stranger, handle("owner"), now, 20))
      .resolves.toEqual({ kind: "restricted", username: handle("owner") });
    await expect(profiles().listProfilePosts(users.ended, handle("owner"), now, 20))
      .resolves.toEqual({ kind: "restricted", username: handle("owner") });
  });

  it("filters a public profile archive before pagination for a non-friend", async () => {
    const first = fullPage(await profiles().listProfilePosts(null, handle("publicOwner"), now, 1));
    const second = fullPage(await profiles().listProfilePosts(null, handle("publicOwner"), now, 1, first.nextCursor!));
    const stranger = fullPage(await profiles().listProfilePosts(users.stranger, handle("publicOwner"), now, 1));

    expect(first.accessTier).toBe("public");
    expect(stranger.accessTier).toBe("public");
    expect(first.items.map((post) => post.id)).toEqual([id("public-24")]);
    expect(first).toMatchObject({ hasMore: true });
    expect(second.items.map((post) => post.id)).toEqual([id("public-22")]);
  });

  it("stops an anonymous archive immediately when the account becomes private", async () => {
    await migrator.client`update public."user" set profile_visibility = 'private' where id = ${users.publicOwner}`;
    try {
      await expect(profiles().listProfilePosts(null, handle("publicOwner"), now, 20))
        .resolves.toEqual({ kind: "restricted", username: handle("publicOwner").toLowerCase() });
    } finally {
      await migrator.client`update public."user" set profile_visibility = 'public' where id = ${users.publicOwner}`;
    }
  });

  it("hides the profile entirely across a block, in both directions", async () => {
    await expect(profiles().listProfilePosts(users.blocked, handle("owner"), now, 20)).resolves.toBeNull();
    await expect(profiles().listProfilePosts(users.owner, handle("blocked"), now, 20)).resolves.toBeNull();
  });

  it("hides unknown and banned profiles", async () => {
    await expect(profiles().listProfilePosts(users.owner, `p${run}nobody`, now, 20)).resolves.toBeNull();
    await expect(profiles().listProfilePosts(users.owner, handle("banned"), now, 20)).resolves.toBeNull();
  });

  it("treats `_` in a handle literally", async () => {
    const wildcard = `${handle("owner").slice(0, -1)}_`;

    await expect(profiles().listProfilePosts(users.friend, wildcard, now, 20)).resolves.toBeNull();
  });

  it("pages deterministically without repeating or skipping posts", async () => {
    const first = fullPage(await profiles().listProfilePosts(users.owner, handle("owner"), now, 3));
    expect(first?.items.map((post) => post.id)).toEqual([id("26-unreleased"), id("24"), id("22")]);
    expect(first?.hasMore).toBe(true);

    const second = fullPage(await profiles().listProfilePosts(users.owner, handle("owner"), now, 3, first.nextCursor!));
    expect(second?.items.map((post) => post.id)).toEqual([id("21-solo"), id("20")]);
    expect(second).toMatchObject({ hasMore: false, nextCursor: null });
  });

  it("shows friends today's post once it is released", async () => {
    const afterMidnight = fullPage(await profiles().listProfilePosts(users.friend, handle("owner"), new Date("2026-09-26T12:00:00.000Z"), 1));

    expect(afterMidnight?.items.map((post) => post.id)).toEqual([id("26-unreleased")]);
  });

  it("rejects an unreadable cursor", async () => {
    await expect(profiles().listProfilePosts(users.owner, handle("owner"), now, 20, "not-a-cursor"))
      .rejects.toBeInstanceOf(InvalidPostCursorError);
  });
});
