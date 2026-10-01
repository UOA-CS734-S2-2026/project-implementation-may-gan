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

suite("unsend message Postgres repository", () => {
  const database = createDayliDatabase(connectionString ?? "postgresql://invalid/messaging_tests");
  const users = Array.from({ length: 4 }, (_, index) => `unsend-message-${crypto.randomUUID()}-${index}`);
  const participantIds = new Map(users.slice().sort().map((userId, index) => [
    userId,
    `${String.fromCharCode(97 + index)}-unsend-message-participant-${crypto.randomUUID()}`,
  ]));
  const divergentParticipantId = participantIds.get(users[0]!)!;
  const { direct, set: setReaction, unsend } = createMessagingPersistenceServices(database.db);

  beforeAll(async () => {
    const now = new Date();
    await database.db.insert(schema.user).values(users.map((id) => ({ id, name: id, email: `${id}@example.test` })));
    for (const [userId, participantId] of participantIds) {
      await database.db.update(schema.messagingParticipants).set({ id: participantId })
        .where(eq(schema.messagingParticipants.userId, userId));
    }
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

  it("tombstones and clears reactions once, then replays without extra changes or outbox work", async () => {
    const created = await direct.create(users[0]!, {
      recipientId: users[1]!,
      clientMessageId: crypto.randomUUID(),
      text: "unsend me",
    });
    await setReaction.set(users[1]!, created.conversation.id, created.message.id, "love");

    await expect(unsend.unsend(users[1]!, created.conversation.id, created.message.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
    const [preservedReaction] = await database.db.select({ count: sql<number>`count(*)::int` })
      .from(schema.messageReactions)
      .where(eq(schema.messageReactions.messageId, created.message.id));
    expect(preservedReaction?.count).toBe(1);

    await expect(unsend.unsend(users[0]!, created.conversation.id, created.message.id)).resolves.toMatchObject({
      replayed: false,
      message: { text: null, reactions: [] },
    });
    const [tombstone] = await database.db.select({
      body: schema.messages.body,
      unsentAt: schema.messages.unsentAt,
    }).from(schema.messages).where(eq(schema.messages.id, created.message.id));
    const [reactions] = await database.db.select({ count: sql<number>`count(*)::int` })
      .from(schema.messageReactions)
      .where(eq(schema.messageReactions.messageId, created.message.id));
    const [changes] = await database.db.select({ count: sql<number>`count(*)::int` })
      .from(schema.conversationChanges)
      .where(and(eq(schema.conversationChanges.conversationId, created.conversation.id), eq(schema.conversationChanges.kind, "message.unsent")));
    const [outbox] = await database.db.select({ count: sql<number>`count(*)::int` })
      .from(schema.messagingOutbox)
      .where(and(eq(schema.messagingOutbox.conversationId, created.conversation.id), eq(schema.messagingOutbox.channel, "realtime")));
    expect(tombstone?.body).toBeNull();
    expect(tombstone?.unsentAt).not.toBeNull();
    expect(reactions?.count).toBe(0);
    expect(changes?.count).toBe(1);
    expect(outbox?.count).toBe(6);
    const [ownership] = await database.db.select({
      senderId: schema.messages.senderId,
      senderParticipantId: schema.messages.senderParticipantId,
      memberId: schema.conversationChanges.memberId,
      memberParticipantId: schema.conversationChanges.memberParticipantId,
    }).from(schema.messages)
      .innerJoin(schema.conversationChanges, and(
        eq(schema.conversationChanges.messageId, schema.messages.id),
        eq(schema.conversationChanges.kind, "message.unsent"),
      ))
      .where(eq(schema.messages.id, created.message.id));
    expect(ownership).toEqual({
      senderId: users[0], senderParticipantId: divergentParticipantId,
      memberId: users[0], memberParticipantId: divergentParticipantId,
    });

    await expect(unsend.unsend(users[0]!, created.conversation.id, created.message.id)).resolves.toMatchObject({ replayed: true });
    const [replayedChanges] = await database.db.select({ count: sql<number>`count(*)::int` })
      .from(schema.conversationChanges)
      .where(and(eq(schema.conversationChanges.conversationId, created.conversation.id), eq(schema.conversationChanges.kind, "message.unsent")));
    const [replayedOutbox] = await database.db.select({ count: sql<number>`count(*)::int` })
      .from(schema.messagingOutbox)
      .where(and(eq(schema.messagingOutbox.conversationId, created.conversation.id), eq(schema.messagingOutbox.channel, "realtime")));
    expect(replayedChanges?.count).toBe(1);
    expect(replayedOutbox?.count).toBe(6);
  });

  it("accepts Number.MAX_SAFE_INTEGER and rolls back an unsafe version before deleting reactions or appending changes", async () => {
    const maximumSafe = await direct.create(users[0]!, {
      recipientId: users[1]!,
      clientMessageId: crypto.randomUUID(),
      text: "maximum safe version",
    });
    await setReaction.set(users[1]!, maximumSafe.conversation.id, maximumSafe.message.id, "love");
    await database.db.update(schema.messages)
      .set({ version: sql`${Number.MAX_SAFE_INTEGER - 1}::bigint` })
      .where(eq(schema.messages.id, maximumSafe.message.id));

    await expect(unsend.unsend(users[0]!, maximumSafe.conversation.id, maximumSafe.message.id)).resolves.toMatchObject({
      replayed: false,
      message: { version: Number.MAX_SAFE_INTEGER, text: null, reactions: [] },
    });

    const overflow = await direct.create(users[0]!, {
      recipientId: users[1]!,
      clientMessageId: crypto.randomUUID(),
      text: "unsafe version",
    });
    await setReaction.set(users[1]!, overflow.conversation.id, overflow.message.id, "love");
    await database.db.update(schema.messages)
      .set({ version: sql`${Number.MAX_SAFE_INTEGER}::bigint` })
      .where(eq(schema.messages.id, overflow.message.id));
    const [beforeChanges] = await database.db.select({ count: sql<number>`count(*)::int` })
      .from(schema.conversationChanges)
      .where(eq(schema.conversationChanges.conversationId, overflow.conversation.id));
    const [beforeOutbox] = await database.db.select({ count: sql<number>`count(*)::int` })
      .from(schema.messagingOutbox)
      .where(eq(schema.messagingOutbox.conversationId, overflow.conversation.id));

    await expect(unsend.unsend(users[0]!, overflow.conversation.id, overflow.message.id)).rejects.toThrow(RangeError);

    const [message] = await database.db.select({
      body: schema.messages.body,
      unsentAt: schema.messages.unsentAt,
      version: sql<string>`${schema.messages.version}::text`,
    }).from(schema.messages).where(eq(schema.messages.id, overflow.message.id));
    const [reactions] = await database.db.select({ count: sql<number>`count(*)::int` })
      .from(schema.messageReactions)
      .where(eq(schema.messageReactions.messageId, overflow.message.id));
    const [changes] = await database.db.select({ count: sql<number>`count(*)::int` })
      .from(schema.conversationChanges)
      .where(eq(schema.conversationChanges.conversationId, overflow.conversation.id));
    const [outbox] = await database.db.select({ count: sql<number>`count(*)::int` })
      .from(schema.messagingOutbox)
      .where(eq(schema.messagingOutbox.conversationId, overflow.conversation.id));
    expect(message).toMatchObject({ body: "unsafe version", unsentAt: null, version: String(Number.MAX_SAFE_INTEGER) });
    expect(reactions?.count).toBe(1);
    expect(changes?.count).toBe(beforeChanges?.count);
    expect(outbox?.count).toBe(beforeOutbox?.count);
  });

  it("allows a pending initiator but rejects a blocked sender without a mutation", async () => {
    const pending = await direct.create(users[0]!, {
      recipientId: users[2]!,
      clientMessageId: crypto.randomUUID(),
      text: "pending request",
    });
    await expect(unsend.unsend(users[0]!, pending.conversation.id, pending.message.id)).resolves.toMatchObject({ replayed: false, message: { text: null } });

    const blocked = await direct.create(users[0]!, {
      recipientId: users[3]!,
      clientMessageId: crypto.randomUUID(),
      text: "blocked message",
    });
    await database.db.insert(schema.relationshipBlocks).values({
      blockerId: users[3]!,
      blockedId: users[0]!,
      blockedAt: new Date(),
    });
    await expect(unsend.unsend(users[0]!, blocked.conversation.id, blocked.message.id)).rejects.toMatchObject({ code: "BLOCKED" });
    const [message] = await database.db.select({
      body: schema.messages.body,
      unsentAt: schema.messages.unsentAt,
    }).from(schema.messages).where(eq(schema.messages.id, blocked.message.id));
    const [changes] = await database.db.select({ count: sql<number>`count(*)::int` })
      .from(schema.conversationChanges)
      .where(and(eq(schema.conversationChanges.conversationId, blocked.conversation.id), eq(schema.conversationChanges.kind, "message.unsent")));
    const [outbox] = await database.db.select({ count: sql<number>`count(*)::int` })
      .from(schema.messagingOutbox)
      .where(and(eq(schema.messagingOutbox.conversationId, blocked.conversation.id), eq(schema.messagingOutbox.channel, "realtime")));
    expect(message).toMatchObject({ body: "blocked message", unsentAt: null });
    expect(changes?.count).toBe(0);
    expect(outbox?.count).toBe(2);
  });
});
