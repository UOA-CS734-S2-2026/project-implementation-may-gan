import { createDayliDatabase } from "@dayli/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPostgresUpdateProfileRepository } from "./update-profile.repository";

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
  const id = (name: string) => `pupd-${run}-${name}`;
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
  });

  afterAll(async () => {
    try {
      await migrator.client`delete from public.username_reservations where user_id = any(${userIds}::text[])`;
      await migrator.client`delete from public.relationship_blocks where blocker_id = any(${userIds}::text[])`;
      await migrator.client`delete from public.friendships where user_id = any(${userIds}::text[])`;
      await migrator.client`delete from public."user" where id = any(${userIds}::text[])`;
    } finally {
      await Promise.all([app.close(), migrator.close()]);
    }
  });

  describe("editing", () => {
    it("changes only the fields sent and clears blank ones", async () => {
      const repository = createPostgresUpdateProfileRepository(app.db);

      const first = await repository.updateProfile(users.stranger, { bio: "New bio", publicName: "Stranger Things" }, now);
      expect(first).toMatchObject({ kind: "updated", profile: { bio: "New bio", displayName: "Stranger Things" } });

      const second = await repository.updateProfile(users.stranger, { publicName: null, profileVisibility: "private" }, now);
      expect(second).toMatchObject({
        kind: "updated",
        profile: { bio: "New bio", displayName: handle("stranger"), owner: { profileVisibility: "private" } },
      });
    });
  });

});
