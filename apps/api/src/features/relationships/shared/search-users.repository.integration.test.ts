import { inArray } from "drizzle-orm";
import { createDayliDatabase, schema } from "@dayli/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { searchUsernameRows } from "./search-users.repository";

const connectionString = process.env.RELATIONSHIP_TEST_DATABASE_URL;
const enabled = Boolean(connectionString);
const target = connectionString ? new URL(connectionString) : undefined;
if (enabled && target?.hostname === "localhost" && target.port === "5433" && target.pathname === "/dayli_test") {
  throw new Error("RELATIONSHIP_TEST_DATABASE_URL must not target the shared dayli_test database.");
}
const suite = enabled ? describe : describe.skip;

function cursor(usernameKey: string, id: string): string {
  return btoa(JSON.stringify({ usernameKey, id })).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

suite("username search Postgres repository", () => {
  const database = createDayliDatabase(connectionString ?? "postgresql://invalid/search_users_tests");
  const run = crypto.randomUUID().replaceAll("-", "").slice(0, 10);
  const id = (name: string) => `search-users-${run}-${name}`;
  const users = {
    actor: id("actor"),
    cursorTarget: id("cursor-zzz"),
    privateUser: id("privacy-private"),
    blockedUser: id("privacy-blocked"),
    bannedUser: id("privacy-banned"),
  };
  const handles = {
    cursor: `Tie_${run}`,
    privacy: `Privacy_${run}`,
  };

  beforeAll(async () => {
    await database.db.insert(schema.user).values([
      { id: users.actor, name: "Actor", email: `${users.actor}@example.test`, username: `actor_${run}` },
      { id: users.cursorTarget, name: "Cursor target", email: `${users.cursorTarget}@example.test`, username: handles.cursor },
      { id: users.privateUser, name: "Private user", email: `${users.privateUser}@example.test`, username: `${handles.privacy}_private`, displayUsername: "Private Card", profileVisibility: "private" },
      { id: users.blockedUser, name: "Blocked user", email: `${users.blockedUser}@example.test`, username: `${handles.privacy}_blocked` },
      { id: users.bannedUser, name: "Banned user", email: `${users.bannedUser}@example.test`, username: `${handles.privacy}_banned`, banned: true },
    ]);
    await database.db.insert(schema.relationshipBlocks).values({
      blockerId: users.blockedUser,
      blockedId: users.actor,
      blockedAt: new Date(),
    });
  });

  afterAll(async () => {
    try {
      await database.db.delete(schema.relationshipBlocks).where(inArray(schema.relationshipBlocks.blockerId, [users.blockedUser]));
      await database.db.delete(schema.user).where(inArray(schema.user.id, Object.values(users)));
    } finally {
      await database.close();
    }
  });

  it("uses lower(username) with the ID tie-breaker for cursors", async () => {
    const beforeTarget = id("cursor-aaa");
    const first = await searchUsernameRows(database.db, users.actor, handles.cursor.toUpperCase(), 1, cursor(handles.cursor.toLowerCase(), beforeTarget));
    const after = await searchUsernameRows(database.db, users.actor, handles.cursor.toLowerCase(), 1, cursor(handles.cursor.toLowerCase(), users.cursorTarget));

    expect(first.items).toEqual([{
      id: users.cursorTarget,
      username: handles.cursor.toLowerCase(),
      displayName: handles.cursor.toLowerCase(),
      relationship: "none",
    }]);
    expect(after.items).toEqual([]);
  });

  it("returns private minimal cards while concealing blocked and banned identities", async () => {
    const page = await searchUsernameRows(database.db, users.actor, handles.privacy, 20);

    expect(page.items).toEqual([{
      id: users.privateUser,
      username: `${handles.privacy}_private`.toLowerCase(),
      displayName: "Private Card",
      relationship: "none",
    }]);
    expect(Object.keys(page.items[0]!)).toEqual(["id", "username", "displayName", "relationship"]);
  });
});
