import { createDayliDatabase, schema } from "@dayli/db";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPostgresAvatarContentRepository } from "../avatar-content.repository";
import { findProfileDetails, findReadableProfile } from "../profile-details.repository";

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
    await migrator.client`
      insert into public.media_reservation
        (id, owner_id, object_key, content_type, byte_size, status, validated_at, expires_at)
      values (${id("public-avatar")}, ${users.publicOwner}, ${`media/${users.publicOwner}/avatar`},
        'image/jpeg', 1024, 'validated', ${now.toISOString()}, ${new Date(now.getTime() + 900_000).toISOString()})
    `;
    await migrator.client`
      insert into public.profile_avatars (user_id, reservation_id, set_at)
      values (${users.publicOwner}, ${id("public-avatar")}, ${now.toISOString()})
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
      await migrator.client`delete from public.posts where author_id = any(${userIds}::text[])`;
      await migrator.client`delete from public.profile_avatars where user_id = any(${userIds}::text[])`;
      await migrator.client`delete from public.media_reservation where owner_id = any(${userIds}::text[])`;
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
        stats: { posts: 3, friends: 1 },
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

  describe("public read contract", () => {
    it("returns public basics with a parent-authorized avatar route to an anonymous reader", async () => {
      const sign = async () => { throw new Error("anonymous avatar signing is forbidden"); };
      const publicAvatarUrl = (username: string) => `https://api.example.test/api/v1/profiles/${username}/avatar`;
      const profile = await findReadableProfile(app.db, null, handle("publicOwner"), now, sign, publicAvatarUrl);

      expect(profile).toEqual({
        kind: "public",
        username: handle("publicOwner"),
        displayName: "Pub",
        bio: "Bio of publicOwner",
        avatarUrl: `https://api.example.test/api/v1/profiles/${handle("publicOwner")}/avatar`,
        streak: { current: 0, longest: 0, lastPostDate: null, postedToday: false, asOf: "2026-09-30" },
      });
      expect(profile).not.toHaveProperty("id");
      expect(profile).not.toHaveProperty("stats");
    });

    it("keeps public-only signed-in readers on the parent-authorized avatar route", async () => {
      const signedKeys: string[] = [];
      const sign = async (objectKey: string) => {
        signedKeys.push(objectKey);
        return `https://r2.example.test/${objectKey}?signed`;
      };

      const profile = await findReadableProfile(
        app.db,
        users.stranger,
        handle("publicOwner"),
        now,
        sign,
        (username) => `https://api.example.test/api/v1/profiles/${username}/avatar`,
      );

      expect(profile).toMatchObject({
        kind: "public",
        avatarUrl: `https://api.example.test/api/v1/profiles/${handle("publicOwner")}/avatar`,
      });
      expect(signedKeys).toEqual([]);
    });

    it.each(["publicOwner", "friend"] as const)("signs the avatar for authorized %s access", async (viewer) => {
      const sign = async (objectKey: string) => `https://r2.example.test/${objectKey}?signed`;
      const profile = await findReadableProfile(app.db, users[viewer], handle("publicOwner"), now, sign);

      expect(profile).toMatchObject({
        kind: "authorized",
        avatarUrl: `https://r2.example.test/media/${users.publicOwner}/avatar?signed`,
      });
    });

    it("authorizes avatar objects from the current profile state on every read", async () => {
      const avatars = createPostgresAvatarContentRepository(app.db);
      await expect(avatars.findAvatar(null, handle("publicOwner"), now)).resolves.toMatchObject({
        objectKey: `media/${users.publicOwner}/avatar`,
        contentType: "image/jpeg",
      });
      await expect(avatars.findAvatar(users.blocked, handle("publicOwner"), now)).resolves.toBeNull();

      await migrator.db.update(schema.user).set({ profileVisibility: "private" }).where(eq(schema.user.id, users.publicOwner));
      try {
        await expect(avatars.findAvatar(null, handle("publicOwner"), now)).resolves.toBeNull();
      } finally {
        await migrator.db.update(schema.user).set({ profileVisibility: "public" }).where(eq(schema.user.id, users.publicOwner));
      }
    });

    it("returns exactly the restricted projection to a private non-friend", async () => {
      await expect(findReadableProfile(app.db, null, handle("privateOwner"), now))
        .resolves.toEqual({ kind: "restricted", username: handle("privateOwner") });
      await expect(findReadableProfile(app.db, users.stranger, handle("privateOwner"), now))
        .resolves.toEqual({ kind: "restricted", username: handle("privateOwner") });
    });

    it("stops anonymous detail disclosure immediately when a public account becomes private", async () => {
      await migrator.client`update public."user" set profile_visibility = 'private' where id = ${users.publicOwner}`;
      try {
        const sign = async () => { throw new Error("private avatar signing is forbidden"); };
        await expect(findReadableProfile(app.db, users.stranger, handle("publicOwner"), now, sign))
          .resolves.toEqual({ kind: "restricted", username: handle("publicOwner") });
      } finally {
        await migrator.client`update public."user" set profile_visibility = 'public' where id = ${users.publicOwner}`;
      }
    });

    it("does not sign or reveal a public avatar across a block", async () => {
      const sign = async () => { throw new Error("blocked avatar signing is forbidden"); };
      await expect(findReadableProfile(app.db, users.blocked, handle("publicOwner"), now, sign)).resolves.toBeNull();
    });

    it("returns the normal full projection to an active friend", async () => {
      const profile = await findReadableProfile(app.db, users.friend, handle("privateOwner"), now);

      expect(profile).toMatchObject({ kind: "authorized", id: users.privateOwner, detailsVisible: true, bio: "Bio of privateOwner" });
    });
  });

});
