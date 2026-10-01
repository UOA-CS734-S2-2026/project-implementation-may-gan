import { createDayliDatabase } from "@dayli/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { findProfileDetails, USERNAME_CHANGE_INTERVAL_MS } from "../shared/profile-details.repository";
import { createPostgresChangeUsernameRepository } from "./change-username.repository";

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
  const id = (name: string) => `pchg-${run}-${name}`;
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

  describe("username changes", () => {
    const changes = () => createPostgresChangeUsernameRepository(app.db);
    const next = `r${run}renamed`;

    it("changes the handle, reserves the old one, and resolves old links", async () => {
      const outcome = await changes().changeUsername(users.renamer, next, now);
      expect(outcome).toEqual({ kind: "changed", username: next, availableAt: new Date(now.getTime() + USERNAME_CHANGE_INTERVAL_MS) });

      const viaOldLink = await findProfileDetails(app.db, users.stranger, handle("renamer"), now);
      expect(viaOldLink).toMatchObject({ id: users.renamer, username: next });
    });

    it("keeps the old handle from anyone else while it is reserved", async () => {
      await expect(changes().changeUsername(users.rival, handle("renamer"), now)).resolves.toEqual({ kind: "taken" });
    });

    it("waits 30 days before another change", async () => {
      const soon = new Date(now.getTime() + 60_000);
      await expect(changes().changeUsername(users.renamer, `r${run}again`, soon)).resolves.toEqual({
        kind: "tooSoon",
        availableAt: new Date(now.getTime() + USERNAME_CHANGE_INTERVAL_MS),
      });
      await expect(findProfileDetails(app.db, users.renamer, next, soon)).resolves.toMatchObject({
        owner: { usernameChangeAvailableAt: new Date(now.getTime() + USERNAME_CHANGE_INTERVAL_MS).toISOString() },
      });
    });

    it("releases the old handle when the reservation ends", async () => {
      const later = new Date(now.getTime() + USERNAME_CHANGE_INTERVAL_MS + 1);
      await expect(findProfileDetails(app.db, users.stranger, handle("renamer"), later)).resolves.toBeNull();
      // The trigger compares against the database clock, so claim only after
      // ageing the reservation itself.
      await migrator.client`update public.username_reservations set reserved_until = now() - interval '1 second' where user_id = ${users.renamer}`;
      await expect(changes().changeUsername(users.rival, handle("renamer"), later)).resolves.toMatchObject({ kind: "changed" });
    });

    it("rejects a handle another account holds", async () => {
      await expect(changes().changeUsername(users.friend, handle("stranger"), now)).resolves.toEqual({ kind: "taken" });
    });

    it("treats the current handle as no change", async () => {
      await expect(changes().changeUsername(users.friend, handle("friend"), now)).resolves.toEqual({
        kind: "unchanged",
        username: handle("friend"),
        availableAt: null,
      });
    });
  });
});
