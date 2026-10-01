import { createDayliDatabase } from "@dayli/db";
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
        insert into public."user" (id, name, email, username, display_username, bio, profile_visibility)
        values (${userId}, ${key}, ${`${userId}@example.test`}, ${handle(key as keyof typeof users)},
          ${key === "publicOwner" ? "Pub" : null}, ${`Bio of ${key}`}, ${key === "privateOwner" ? "private" : "public"})
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
  });

  afterAll(async () => {
    try {
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
        avatarUrl: null,
        streak: { current: 2, longest: 2, lastPostDate: "2026-09-29", postedToday: false, asOf: "2026-09-30" },
        stats: { posts: 3, friends: 1 },
        owner: { profileVisibility: "private", usernameChangeAvailableAt: null },
      });
    });

    it("shows a public bio to anyone signed in, without the owner's settings", async () => {
      const profile = await findProfileDetails(app.db, users.stranger, handle("publicOwner"), now);

      expect(profile).toMatchObject({ displayName: "Pub", detailsVisible: true, bio: "Bio of publicOwner", owner: null });
    });

    it("shows a private bio only to active friends", async () => {
      await expect(findProfileDetails(app.db, users.friend, handle("privateOwner"), now))
        .resolves.toMatchObject({ detailsVisible: true, bio: "Bio of privateOwner" });
      await expect(findProfileDetails(app.db, users.friend, handle("privateOwner"), now))
        .resolves.toMatchObject({ streak: { current: 2, longest: 2 } });
      await expect(findProfileDetails(app.db, users.stranger, handle("privateOwner"), now))
        .resolves.toMatchObject({ detailsVisible: false, bio: null, streak: null, stats: null, owner: null });
    });

    it("hides the profile across a block, in both directions", async () => {
      await expect(findProfileDetails(app.db, users.blocked, handle("publicOwner"), now)).resolves.toBeNull();
      await expect(findProfileDetails(app.db, users.publicOwner, handle("blocked"), now)).resolves.toBeNull();
    });

    it("hides unknown handles and treats `_` literally", async () => {
      await expect(findProfileDetails(app.db, users.stranger, `r${run}nobody`, now)).resolves.toBeNull();
      await expect(findProfileDetails(app.db, users.stranger, `${handle("friend").slice(0, -1)}_`, now)).resolves.toBeNull();
    });
  });

});
