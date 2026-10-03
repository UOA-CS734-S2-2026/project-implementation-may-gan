import { eq, inArray, sql } from "drizzle-orm";
import { createDayliDatabase, schema } from "@dayli/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { consumeUsernameSearchQuota, searchUsernameRows } from "./search-users.repository";

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
  const concurrentDatabase = createDayliDatabase(connectionString ?? "postgresql://invalid/search_users_tests");
  const run = crypto.randomUUID().replaceAll("-", "").slice(0, 10);
  const id = (name: string) => `search-users-${run}-${name}`;
  const users = {
    actor: id("actor"),
    cursorTarget: id("cursor-zzz"),
    privateUser: id("privacy-private"),
    blockedUser: id("privacy-blocked"),
    bannedUser: id("privacy-banned"),
    quotaCommit: id("quota-commit"),
    quotaRollback: id("quota-rollback"),
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
      { id: users.quotaCommit, name: "Quota commit", email: `${users.quotaCommit}@example.test`, username: `quota_commit_${run}` },
      { id: users.quotaRollback, name: "Quota rollback", email: `${users.quotaRollback}@example.test`, username: `quota_rollback_${run}` },
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
      await concurrentDatabase.close();
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

  it("removes a pending account from discovery and restores it after cancellation", async () => {
    const requestedAt = new Date();
    await database.db.insert(schema.accountLifecycles).values({
      userId: users.privateUser, state: "pending_deletion", generation: 1,
      requestId: id("request"), idempotencyKeyDigest: "a".repeat(64),
      requestedAt,
      cancelUntil: new Date(requestedAt.getTime() + 168 * 60 * 60_000),
      purgeDueAt: new Date(requestedAt.getTime() + 336 * 60 * 60_000),
    });
    try {
      const hidden = await searchUsernameRows(database.db, users.actor, handles.privacy, 20);
      expect(hidden.items).toEqual([]);
    } finally {
      await database.db.delete(schema.accountLifecycles).where(eq(schema.accountLifecycles.userId, users.privateUser));
    }
    const restored = await searchUsernameRows(database.db, users.actor, handles.privacy, 20);
    expect(restored.items.map((item) => item.id)).toEqual([users.privateUser]);
  });

  it("serializes quota attempts and releases the lock after commit", async () => {
    const now = new Date("2026-09-30T00:00:00.000Z");
    let releaseLock: (() => void) | undefined;
    let signalLocked: (() => void) | undefined;
    const locked = new Promise<void>((resolve) => { signalLocked = resolve; });
    const release = new Promise<void>((resolve) => { releaseLock = resolve; });
    const holder = database.db.transaction(async (transaction) => {
      await consumeUsernameSearchQuota(transaction, users.quotaCommit, now);
      signalLocked!();
      await release;
    });

    await locked;
    try {
      await expect(concurrentDatabase.db.transaction(async (transaction) => {
        await transaction.execute(sql`set local lock_timeout = '100ms'`);
        await consumeUsernameSearchQuota(transaction, users.quotaCommit, now);
      })).rejects.toMatchObject({ cause: { code: "55P03" } });
    } finally {
      releaseLock!();
      await holder;
    }

    await expect(concurrentDatabase.db.transaction((transaction) => (
      consumeUsernameSearchQuota(transaction, users.quotaCommit, now)
    ))).resolves.toBeUndefined();
  });

  it("releases the quota lock after rollback", async () => {
    const now = new Date("2026-09-30T00:00:00.000Z");
    const rollback = new Error("rollback quota holder");
    let releaseLock: (() => void) | undefined;
    let signalLocked: (() => void) | undefined;
    const locked = new Promise<void>((resolve) => { signalLocked = resolve; });
    const release = new Promise<void>((resolve) => { releaseLock = resolve; });
    const holder = database.db.transaction(async (transaction) => {
      await consumeUsernameSearchQuota(transaction, users.quotaRollback, now);
      signalLocked!();
      await release;
      throw rollback;
    });

    await locked;
    try {
      await expect(concurrentDatabase.db.transaction(async (transaction) => {
        await transaction.execute(sql`set local lock_timeout = '100ms'`);
        await consumeUsernameSearchQuota(transaction, users.quotaRollback, now);
      })).rejects.toMatchObject({ cause: { code: "55P03" } });
    } finally {
      releaseLock!();
    }
    await expect(holder).rejects.toBe(rollback);

    await expect(concurrentDatabase.db.transaction((transaction) => (
      consumeUsernameSearchQuota(transaction, users.quotaRollback, now)
    ))).resolves.toBeUndefined();
  });
});
