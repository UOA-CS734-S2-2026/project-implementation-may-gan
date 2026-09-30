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

suite("remove reaction Postgres repository", () => {
  const database = createDayliDatabase(connectionString ?? "postgresql://invalid/messaging_tests");
  const users = Array.from({ length: 4 }, (_, index) => `remove-reaction-${crypto.randomUUID()}-${index}`);
  const { direct, set: setReaction, remove: removeReaction } = createMessagingPersistenceServices(database.db);

  beforeAll(async () => {
    const now = new Date();
    await database.db.insert(schema.user).values(users.map((id) => ({ id, name: id, email: `${id}@example.test` })));
    await database.db.insert(schema.friendships).values([
      { userId: users[0]!, friendId: users[1]!, state: "active", stateChangedAt: now },
      { userId: users[1]!, friendId: users[0]!, state: "active", stateChangedAt: now },
      { userId: users[0]!, friendId: users[3]!, state: "active", stateChangedAt: now },
      { userId: users[3]!, friendId: users[0]!, state: "active", stateChangedAt: now },
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

  it("authorizes removal, preserves other actors' reactions, and writes outbox work only for changes", async () => {
    const created = await direct.create(users[0]!, {
      recipientId: users[1]!,
      clientMessageId: crypto.randomUUID(),
      text: "remove this reaction",
    });
    const { conversation, message } = created;

    await expect(removeReaction.remove(users[2]!, conversation.id, message.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await setReaction.set(users[0]!, conversation.id, message.id, "like");
    await setReaction.set(users[1]!, conversation.id, message.id, "love");

    await expect(removeReaction.remove(users[1]!, conversation.id, message.id)).resolves.toMatchObject({
      changed: true,
      message: { reactions: [{ reaction: "like", count: 1, reactedByActor: false }] },
    });
    const [changedReactions] = await database.db.select({
      reaction: schema.messageReactions.reaction,
      userId: schema.messageReactions.userId,
    }).from(schema.messageReactions).where(eq(schema.messageReactions.messageId, message.id));
    const [changedChanges] = await database.db.select({ count: sql<number>`count(*)::int` })
      .from(schema.conversationChanges)
      .where(and(eq(schema.conversationChanges.conversationId, conversation.id), eq(schema.conversationChanges.kind, "reaction.changed")));
    const [changedOutbox] = await database.db.select({ count: sql<number>`count(*)::int` })
      .from(schema.messagingOutbox)
      .where(and(eq(schema.messagingOutbox.conversationId, conversation.id), eq(schema.messagingOutbox.channel, "realtime")));
    expect(changedReactions).toMatchObject({ reaction: "like", userId: users[0] });
    expect(changedChanges?.count).toBe(3);
    expect(changedOutbox?.count).toBe(8);

    await expect(removeReaction.remove(users[1]!, conversation.id, message.id)).resolves.toMatchObject({ changed: false });
    const [unchangedChanges] = await database.db.select({ count: sql<number>`count(*)::int` })
      .from(schema.conversationChanges)
      .where(and(eq(schema.conversationChanges.conversationId, conversation.id), eq(schema.conversationChanges.kind, "reaction.changed")));
    const [unchangedOutbox] = await database.db.select({ count: sql<number>`count(*)::int` })
      .from(schema.messagingOutbox)
      .where(and(eq(schema.messagingOutbox.conversationId, conversation.id), eq(schema.messagingOutbox.channel, "realtime")));
    expect(unchangedChanges?.count).toBe(3);
    expect(unchangedOutbox?.count).toBe(8);
  });

  it("rejects removal for blocked peers and unsent messages without deleting reactions", async () => {
    const blocked = await direct.create(users[0]!, {
      recipientId: users[3]!,
      clientMessageId: crypto.randomUUID(),
      text: "blocked reaction",
    });
    await setReaction.set(users[3]!, blocked.conversation.id, blocked.message.id, "sad");
    await database.db.insert(schema.relationshipBlocks).values({
      blockerId: users[0]!,
      blockedId: users[3]!,
      blockedAt: new Date(),
    });

    await expect(removeReaction.remove(users[3]!, blocked.conversation.id, blocked.message.id)).rejects.toMatchObject({ code: "BLOCKED" });
    const [blockedReaction] = await database.db.select({ count: sql<number>`count(*)::int` })
      .from(schema.messageReactions)
      .where(and(eq(schema.messageReactions.messageId, blocked.message.id), eq(schema.messageReactions.userId, users[3]!)));
    expect(blockedReaction?.count).toBe(1);

    const unsent = await direct.create(users[0]!, {
      recipientId: users[1]!,
      clientMessageId: crypto.randomUUID(),
      text: "unsent reaction",
    });
    await setReaction.set(users[1]!, unsent.conversation.id, unsent.message.id, "thanks");
    await database.db.update(schema.messages)
      .set({ body: null, unsentAt: new Date() })
      .where(eq(schema.messages.id, unsent.message.id));

    await expect(removeReaction.remove(users[1]!, unsent.conversation.id, unsent.message.id)).rejects.toMatchObject({ code: "CONFLICT" });
    const [unsentReaction] = await database.db.select({ count: sql<number>`count(*)::int` })
      .from(schema.messageReactions)
      .where(and(eq(schema.messageReactions.messageId, unsent.message.id), eq(schema.messageReactions.userId, users[1]!)));
    expect(unsentReaction?.count).toBe(1);
  });
});
