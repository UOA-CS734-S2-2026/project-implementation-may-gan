import { createDayliDatabase, schema } from "@dayli/db";
import { and, eq, inArray, or, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createMessagingPersistenceServices } from "../../../../../app";

const connectionString = process.env.MESSAGING_TEST_DATABASE_URL;
const enabled = Boolean(connectionString);
const target = connectionString ? new URL(connectionString) : undefined;
if (enabled && target?.hostname === "localhost" && target.port === "5433" && target.pathname !== "/dayli_messaging_test") {
  throw new Error("MESSAGING_TEST_DATABASE_URL must use the isolated dayli_messaging_test database.");
}
const suite = enabled ? describe : describe.skip;

suite("set reaction Postgres repository", () => {
  const database = createDayliDatabase(connectionString ?? "postgresql://invalid/messaging_tests");
  const users = Array.from({ length: 3 }, (_, index) => `set-reaction-${crypto.randomUUID()}-${index}`);
  const { direct, set: setReaction } = createMessagingPersistenceServices(database.db);

  beforeAll(async () => {
    const now = new Date();
    await database.db.insert(schema.user).values(users.map((id) => ({ id, name: id, email: `${id}@example.test` })));
    await database.db.insert(schema.friendships).values([
      { userId: users[0]!, friendId: users[1]!, state: "active", stateChangedAt: now },
      { userId: users[1]!, friendId: users[0]!, state: "active", stateChangedAt: now },
    ]);
  });

  afterAll(async () => {
    try {
      await database.db.delete(schema.relationshipBlocks).where(or(
        inArray(schema.relationshipBlocks.blockerId, users),
        inArray(schema.relationshipBlocks.blockedId, users),
      ));
      await database.db.delete(schema.friendships).where(or(
        inArray(schema.friendships.userId, users),
        inArray(schema.friendships.friendId, users),
      ));
      await database.db.delete(schema.friendRequests).where(or(
        inArray(schema.friendRequests.senderId, users),
        inArray(schema.friendRequests.recipientId, users),
      ));
      await database.db.delete(schema.user).where(inArray(schema.user.id, users));
    } finally {
      await database.close();
    }
  });

  it("authorizes reactions, leaves same reactions unchanged, and persists changes with realtime outbox work", async () => {
    const created = await direct.create(users[0]!, {
      recipientId: users[1]!,
      clientMessageId: crypto.randomUUID(),
      text: "react to this",
    });
    const { conversation } = created;
    const { message } = created;

    await expect(setReaction.set(users[2]!, conversation.id, message.id, "love")).rejects.toMatchObject({ code: "NOT_FOUND" });

    await expect(setReaction.set(users[1]!, conversation.id, message.id, "love")).resolves.toMatchObject({
      changed: true,
      message: { reactions: [{ reaction: "love", count: 1, reactedByActor: true }] },
    });
    const [initialChanges] = await database.db.select({ count: sql<number>`count(*)::int` })
      .from(schema.conversationChanges)
      .where(and(eq(schema.conversationChanges.conversationId, conversation.id), eq(schema.conversationChanges.kind, "reaction.changed")));
    const [initialOutbox] = await database.db.select({ count: sql<number>`count(*)::int` })
      .from(schema.messagingOutbox)
      .where(and(eq(schema.messagingOutbox.conversationId, conversation.id), eq(schema.messagingOutbox.channel, "realtime")));
    expect(initialChanges?.count).toBe(1);
    expect(initialOutbox?.count).toBe(4);

    await expect(setReaction.set(users[1]!, conversation.id, message.id, "love")).resolves.toMatchObject({ changed: false });
    const [unchangedChanges] = await database.db.select({ count: sql<number>`count(*)::int` })
      .from(schema.conversationChanges)
      .where(and(eq(schema.conversationChanges.conversationId, conversation.id), eq(schema.conversationChanges.kind, "reaction.changed")));
    const [unchangedOutbox] = await database.db.select({ count: sql<number>`count(*)::int` })
      .from(schema.messagingOutbox)
      .where(and(eq(schema.messagingOutbox.conversationId, conversation.id), eq(schema.messagingOutbox.channel, "realtime")));
    expect(unchangedChanges?.count).toBe(1);
    expect(unchangedOutbox?.count).toBe(4);

    await expect(setReaction.set(users[1]!, conversation.id, message.id, "laugh")).resolves.toMatchObject({
      changed: true,
      message: { reactions: [{ reaction: "laugh", count: 1, reactedByActor: true }] },
    });
    const [changedChanges] = await database.db.select({ count: sql<number>`count(*)::int` })
      .from(schema.conversationChanges)
      .where(and(eq(schema.conversationChanges.conversationId, conversation.id), eq(schema.conversationChanges.kind, "reaction.changed")));
    const [changedOutbox] = await database.db.select({ count: sql<number>`count(*)::int` })
      .from(schema.messagingOutbox)
      .where(and(eq(schema.messagingOutbox.conversationId, conversation.id), eq(schema.messagingOutbox.channel, "realtime")));
    expect(changedChanges?.count).toBe(2);
    expect(changedOutbox?.count).toBe(6);
  });
});
