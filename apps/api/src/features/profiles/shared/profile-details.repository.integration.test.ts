import { createDayliDatabase, schema } from "@dayli/db";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { findProfileDetails } from "./profile-details.repository";

const migratorUrl = process.env.TEST_DATABASE_URL;
const appUrl = process.env.TEST_APP_DATABASE_URL;
const enabled = Boolean(migratorUrl && appUrl && process.env.POSTS_POSTGRES_TEST === "1");
const testPostgresPort = process.env.VERIFY_POSTGRES_PORT ?? "5433";

function requireLocalTestUrl(value: string): string {
  const url = new URL(value);
  if (url.hostname !== "localhost" || url.port !== testPostgresPort || url.pathname !== "/dayli_test") {
    throw new Error(`Profile tests must target localhost:${testPostgresPort}/dayli_test.`);
  }
  return value;
}

/**
 * Reads and writes run through the restricted app role, as the Worker does.
 * Fixture rows are written by the migrator, are unique per run, and are
 * removed afterwards.
 */
(enabled ? describe : describe.skip)("PostgreSQL profiles", () => {
  const migrator = createDayliDatabase(requireLocalTestUrl(migratorUrl ?? "postgresql://localhost:5433/dayli_test"));
  const app = createDayliDatabase(requireLocalTestUrl(appUrl ?? "postgresql://localhost:5433/dayli_test"));
  const run = crypto.randomUUID().replaceAll("-", "").slice(0, 8);
  const id = (name: string) => `pdet-${run}-${name}`;
  const users = {
    publicOwner: id("public"),
    privateOwner: id("private"),
    friend: id("friend"),
    stranger: id("stranger"),
    blocked: id("blocked"),
    renamer: id("renamer"),
    rival: id("rival"),
  };
  const handle = (key: keyof typeof users) => `p${run}${key}`.toLowerCase().slice(0, 30);
  const userIds = Object.values(users);
  const now = new Date("2026-09-30T03:00:00.000Z");

  beforeAll(async () => {
    for (const [key, userId] of Object.entries(users)) {
      await migrator.client`
        insert into public."user" (id, name, email, username, display_username, bio, profile_visibility, mbti, what_i_do)
        values (${userId}, ${key}, ${`${userId}@example.test`}, ${handle(key as keyof typeof users)},
          ${key === "publicOwner" ? "Pub" : null}, ${`Bio of ${key}`}, ${key === "privateOwner" ? "private" : "public"},
          ${key === "privateOwner" ? "INTJ" : "not-a-type"}, ${key === "privateOwner" ? "Nursing" : null})
      `;
    }
    const changedAt = now.toISOString();
    for (const owner of [users.publicOwner, users.privateOwner]) {
      await migrator.client`
        insert into public.friendships (user_id, friend_id, state, state_changed_at)
        values (${owner}, ${users.friend}, 'active', ${changedAt}), (${users.friend}, ${owner}, 'active', ${changedAt})
      `;
    }
    await migrator.client`
      insert into public.relationship_blocks (blocker_id, blocked_id, blocked_at)
      values (${users.publicOwner}, ${users.blocked}, ${changedAt})
    `;
    // Two days in a row ending yesterday, after a missed day.
    for (const localDate of ["2026-09-26", "2026-09-28", "2026-09-29"]) {
      await migrator.client`
        insert into public.posts (id, author_id, local_date, prompt_id, reflective_answer, rating, audience, accepted_at, released_at)
        values (${id(`post-${localDate}`)}, ${users.privateOwner}, ${localDate}, ${`prompt-${localDate.slice(5)}`}, 'An answer', 7,
          ${localDate === "2026-09-28" ? "solo" : "friends"}, ${`${localDate}T03:00:00.000Z`}, ${`${localDate}T12:00:00.000Z`})
      `;
    }
    // A post in Trash on the missed day doesn't fill the gap or count as a post.
    await migrator.client`
      insert into public.posts (id, author_id, local_date, prompt_id, reflective_answer, rating, audience, accepted_at, released_at,
        trashed_at, restore_until, trash_purge_due_at)
      values (${id("post-deleted")}, ${users.privateOwner}, '2026-09-27', 'prompt-09-27', 'An answer', 7, 'friends',
        '2026-09-27T03:00:00.000Z', '2026-09-27T12:00:00.000Z',
        '2026-09-27T04:00:00.000Z', '2026-10-04T04:00:00.000Z', '2026-10-11T04:00:00.000Z')
    `;
  });

  afterAll(async () => {
    try {
      await migrator.client`delete from public.post_likes where user_id = any(${userIds}::text[])`;
      await migrator.client`delete from public.posts where author_id = any(${userIds}::text[])`;
      await migrator.client`delete from public.username_reservations where user_id = any(${userIds}::text[])`;
      await migrator.client`delete from public.relationship_blocks where blocker_id = any(${userIds}::text[])`;
      await migrator.client`delete from public.friendships where user_id = any(${userIds}::text[])`;
      await migrator.client`delete from public."user" where id = any(${userIds}::text[])`;
    } finally {
      await Promise.all([app.close(), migrator.close()]);
    }
  });

  describe("details", () => {
    it("shows the owner their bio and settings", async () => {
      await expect(findProfileDetails(app.db, users.privateOwner, handle("privateOwner"), now)).resolves.toEqual({
        id: users.privateOwner,
        username: handle("privateOwner"),
        displayName: handle("privateOwner"),
        detailsVisible: true,
        bio: "Bio of privateOwner",
        mbti: "INTJ",
        whatIDo: "Nursing",
        listeningTo: null,
        avatarUrl: null,
        streak: { current: 2, longest: 2, lastPostDate: "2026-09-29", postedToday: false, asOf: "2026-09-30" },
        stats: { posts: 3, friends: 1, loved: 0 },
        owner: { profileVisibility: "private", usernameChangeAvailableAt: null },
      });
    });

    it("shows a public bio to anyone signed in, without the owner's settings", async () => {
      const profile = await findProfileDetails(app.db, users.stranger, handle("publicOwner"), now);

      // A legacy value outside the 16 types reads as unset.
      expect(profile).toMatchObject({ displayName: "Pub", detailsVisible: true, bio: "Bio of publicOwner", mbti: null, owner: null });
    });

    it("shows a private bio only to active friends", async () => {
      await expect(findProfileDetails(app.db, users.friend, handle("privateOwner"), now))
        .resolves.toMatchObject({ detailsVisible: true, bio: "Bio of privateOwner" });
      await expect(findProfileDetails(app.db, users.friend, handle("privateOwner"), now))
        .resolves.toMatchObject({ streak: { current: 2, longest: 2 } });
      await expect(findProfileDetails(app.db, users.stranger, handle("privateOwner"), now))
        .resolves.toMatchObject({ detailsVisible: false, bio: null, mbti: null, whatIDo: null, streak: null, stats: null, owner: null });
    });

    it("counts likes on posts that haven't been deleted as loved", async () => {
      await migrator.client`
        insert into public.post_likes (post_id, user_id)
        values (${id("post-2026-09-29")}, ${users.friend}), (${id("post-2026-09-28")}, ${users.privateOwner}),
          (${id("post-deleted")}, ${users.friend})
      `;

      await expect(findProfileDetails(app.db, users.friend, handle("privateOwner"), now))
        .resolves.toMatchObject({ stats: { posts: 3, loved: 2 } });
      await migrator.client`delete from public.post_likes where user_id = any(${userIds}::text[])`;
    });

    it("hides the profile across a block, in both directions", async () => {
      await expect(findProfileDetails(app.db, users.blocked, handle("publicOwner"), now)).resolves.toBeNull();
      await expect(findProfileDetails(app.db, users.publicOwner, handle("blocked"), now)).resolves.toBeNull();
    });

    it("hides a pending owner's profile, then restores it after cancellation", async () => {
      const requestedAt = new Date();
      await migrator.db.insert(schema.accountLifecycles).values({
        userId: users.publicOwner, state: "pending_deletion", generation: 1,
        requestId: id("deletion-request"), idempotencyKeyDigest: "a".repeat(64),
        requestedAt,
        cancelUntil: new Date(requestedAt.getTime() + 168 * 60 * 60_000),
        purgeDueAt: new Date(requestedAt.getTime() + 336 * 60 * 60_000),
      });
      try {
        await expect(findProfileDetails(app.db, users.stranger, handle("publicOwner"), now)).resolves.toBeNull();
        await expect(findProfileDetails(app.db, users.publicOwner, handle("publicOwner"), now)).resolves.toBeNull();
      } finally {
        await migrator.db.delete(schema.accountLifecycles).where(eq(schema.accountLifecycles.userId, users.publicOwner));
      }
      await expect(findProfileDetails(app.db, users.stranger, handle("publicOwner"), now))
        .resolves.toMatchObject({ id: users.publicOwner });
    });

    it("hides unknown handles and treats `_` literally", async () => {
      await expect(findProfileDetails(app.db, users.stranger, `r${run}nobody`, now)).resolves.toBeNull();
      await expect(findProfileDetails(app.db, users.stranger, `${handle("friend").slice(0, -1)}_`, now)).resolves.toBeNull();
    });
  });

});
