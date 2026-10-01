import { createDayliDatabase, schema, sql } from "@dayli/db";
import { and, eq, inArray, or } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createMessagingPersistenceServices } from "../../../../../app";
import { createPostgresGetConversationRepository } from "../get-conversation.repository";

const connectionString = process.env.MESSAGING_TEST_DATABASE_URL;
const enabled = Boolean(connectionString);
const target = connectionString ? new URL(connectionString) : undefined;
if (enabled && target?.hostname === "localhost" && target.port === "5433" && target.pathname !== "/dayli_messaging_test") {
  throw new Error("MESSAGING_TEST_DATABASE_URL must use the isolated dayli_messaging_test database.");
}
const suite = enabled ? describe : describe.skip;

suite("get conversation Postgres repository", () => {
  const database = createDayliDatabase(connectionString ?? "postgresql://invalid/messaging_tests");
  const users = Array.from({ length: 4 }, (_, index) => `get-conversation-${crypto.randomUUID()}-${index}`);
  const { direct, send, unsend } = createMessagingPersistenceServices(database.db);
  const repository = createPostgresGetConversationRepository(database.db);
  const builderQueries: string[] = [];
  const observedRepository = createPostgresGetConversationRepository(drizzle(database.client, {
    schema,
    logger: { logQuery(query) { builderQueries.push(query); } },
  }));

  beforeAll(async () => {
    await database.db.insert(schema.user).values(users.map((id) => ({ id, name: id, email: `${id}@example.test` })));
    await database.db.insert(schema.friendships).values([
      { userId: users[0]!, friendId: users[1]!, state: "active", stateChangedAt: new Date() },
      { userId: users[1]!, friendId: users[0]!, state: "active", stateChangedAt: new Date() },
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

  it("keeps private membership, unread, latest-message, and capability semantics", async () => {
    const active = await direct.create(users[0]!, {
      recipientId: users[1]!,
      clientMessageId: crypto.randomUUID(),
      text: "first message",
    });
    const reply = await send.send(users[1]!, active.conversation.id, {
      clientMessageId: crypto.randomUUID(),
      text: "latest message",
    });
    const pending = await direct.create(users[0]!, {
      recipientId: users[2]!,
      clientMessageId: crypto.randomUUID(),
      text: "message request",
    });

    await expect(repository.get(users[3]!, active.conversation.id)).rejects.toMatchObject({ code: "NOT_FOUND" });

    await expect(repository.get(users[0]!, active.conversation.id)).resolves.toMatchObject({
      id: active.conversation.id,
      peer: { id: users[1], name: null },
      requestState: "active",
      latestMessage: { id: reply.message.id, sequence: "2", senderId: users[1], text: "latest message" },
      unreadCount: 1,
      lastMessageSequence: "2",
      lastReadSequence: "0",
      receiptSequence: "0",
      capabilities: { canSend: true, canResolveRequest: false },
    });
    await expect(repository.get(users[2]!, pending.conversation.id)).resolves.toMatchObject({
      id: pending.conversation.id,
      peer: { id: users[0], name: null },
      requestState: "pending",
      latestMessage: { id: pending.message.id, sequence: "1", senderId: users[0], text: "message request" },
      unreadCount: 1,
      capabilities: { canSend: false, canResolveRequest: true },
    });

    const sequence = "9007199254740991";
    const lastReadSequence = "9007199254740990";
    await database.db.update(schema.messages).set({ sequence: Number(sequence) }).where(eq(schema.messages.id, reply.message.id));
    await database.db.update(schema.conversations).set({ lastMessageSequence: Number(sequence) }).where(eq(schema.conversations.id, active.conversation.id));
    await database.db.update(schema.conversationMembers).set({
      lastReadSequence: Number(lastReadSequence),
      receiptSequence: Number(lastReadSequence),
    }).where(and(
      eq(schema.conversationMembers.conversationId, active.conversation.id),
      eq(schema.conversationMembers.userId, users[0]!),
    ));

    await database.db.insert(schema.messageReactions).values([
      { messageId: reply.message.id, userId: users[0]!, participantId: users[0]!, reaction: "love", createdAt: new Date() },
      { messageId: reply.message.id, userId: users[1]!, participantId: users[1]!, reaction: "love", createdAt: new Date() },
    ]);
    builderQueries.length = 0;
    await expect(observedRepository.get(users[0]!, active.conversation.id)).resolves.toMatchObject({
      latestMessage: {
        id: reply.message.id,
        sequence,
        version: 1,
        senderId: users[1],
        text: "latest message",
        reactions: [{ reaction: "love", count: 2, reactedByActor: true }],
      },
      unreadCount: 1,
      lastMessageSequence: sequence,
      lastReadSequence,
      receiptSequence: lastReadSequence,
    });
    expect(builderQueries).toHaveLength(5);
    const latestQuery = builderQueries.find((query) => query.includes('order by "messages"."sequence" desc'));
    const unreadQuery = builderQueries.find((query) => query.includes('count(*)'));
    expect(latestQuery).toBeDefined();
    expect(latestQuery).not.toContain('::text');
    expect(unreadQuery).toBeDefined();
    expect(unreadQuery).not.toContain('::int');
    expect(unreadQuery).not.toContain('::bigint');

    await unsend.unsend(users[1]!, active.conversation.id, reply.message.id);
    await expect(repository.get(users[0]!, active.conversation.id)).resolves.toMatchObject({
      latestMessage: { id: reply.message.id, text: null, unsentAt: expect.any(String), reactions: [] },
    });
    const blank = await direct.create(users[0]!, {
      recipientId: users[3]!,
      clientMessageId: crypto.randomUUID(),
      text: "blank latest message",
    });
    await database.db.delete(schema.messages).where(eq(schema.messages.id, blank.message.id));
    await database.db.update(schema.conversations).set({ lastMessageSequence: 0, lastChangeSequence: 0 })
      .where(eq(schema.conversations.id, blank.conversation.id));
    await expect(repository.get(users[0]!, blank.conversation.id)).resolves.toMatchObject({ latestMessage: null });

    await database.db.insert(schema.relationshipBlocks).values({
      blockerId: users[0]!,
      blockedId: users[1]!,
      blockedAt: new Date(),
    });
    await expect(repository.get(users[0]!, active.conversation.id)).resolves.toMatchObject({
      id: active.conversation.id,
      capabilities: { canSend: false, canResolveRequest: false },
    });

    // Drizzle's bigint number mode cannot represent values above MAX_SAFE_INTEGER exactly.
    await database.db.update(schema.conversations).set({ lastMessageSequence: sql`9007199254740993::bigint` })
      .where(eq(schema.conversations.id, active.conversation.id));
    await expect(repository.get(users[0]!, active.conversation.id)).rejects.toThrow("Database sequence must be a safe nonnegative integer.");
    // This mixed safe and overflowing bigint update needs exact native PostgreSQL literals.
    await database.db.update(schema.conversations).set({
      lastMessageSequence: sql`${sequence}::bigint`,
      lastChangeSequence: sql`9007199254740993::bigint`,
    }).where(eq(schema.conversations.id, active.conversation.id));
    await expect(repository.get(users[0]!, active.conversation.id)).rejects.toThrow("Database sequence must be a safe nonnegative integer.");
    await database.db.update(schema.conversations).set({ lastChangeSequence: 2 })
      .where(eq(schema.conversations.id, active.conversation.id));
    // Drizzle's bigint number mode cannot represent values above MAX_SAFE_INTEGER exactly.
    await database.db.update(schema.conversationMembers).set({
      lastReadSequence: sql`9007199254740993::bigint`,
      receiptSequence: sql`9007199254740993::bigint`,
    }).where(and(
      eq(schema.conversationMembers.conversationId, active.conversation.id),
      eq(schema.conversationMembers.userId, users[0]!),
    ));
    await expect(repository.get(users[0]!, active.conversation.id)).rejects.toThrow("Database sequence must be a safe nonnegative integer.");
    await database.db.update(schema.conversationMembers).set({
      lastReadSequence: Number(lastReadSequence),
      receiptSequence: Number(lastReadSequence),
    }).where(and(
      eq(schema.conversationMembers.conversationId, active.conversation.id),
      eq(schema.conversationMembers.userId, users[0]!),
    ));
    // Drizzle's bigint number mode cannot represent values above MAX_SAFE_INTEGER exactly.
    await database.db.update(schema.messages).set({ sequence: sql`9007199254740993::bigint` })
      .where(eq(schema.messages.id, reply.message.id));
    await expect(repository.get(users[0]!, active.conversation.id)).rejects.toThrow("Database sequence must be a safe nonnegative integer.");
    await database.db.update(schema.messages).set({ sequence: Number(sequence) }).where(eq(schema.messages.id, reply.message.id));
    // Drizzle's bigint number mode cannot represent values above MAX_SAFE_INTEGER exactly.
    await database.db.update(schema.messages).set({ version: sql`9007199254740993::bigint` })
      .where(eq(schema.messages.id, reply.message.id));
    await expect(repository.get(users[0]!, active.conversation.id)).rejects.toThrow("Database message version must be a positive safe integer.");
  });

  it("masks a pending-deletion peer without profile values", async () => {
    const [conversation] = await database.db.select({ id: schema.conversations.id })
      .from(schema.conversations)
      .where(or(
        and(eq(schema.conversations.userLowId, users[0]!), eq(schema.conversations.userHighId, users[2]!)),
        and(eq(schema.conversations.userLowId, users[2]!), eq(schema.conversations.userHighId, users[0]!)),
      ))
      .limit(1);
    if (!conversation) throw new Error("Expected a conversation for lifecycle peer projection.");
    await database.db.update(schema.user).set({
      name: "private lifecycle peer name",
      username: "privatelifecyclepeer",
      displayUsername: "private lifecycle peer display name",
      image: "https://example.test/private-lifecycle-peer-avatar.png",
    }).where(eq(schema.user.id, users[2]!));
    const requestedAt = new Date();
    await database.db.insert(schema.accountLifecycles).values({
      userId: users[2]!,
      state: "pending_deletion",
      requestId: crypto.randomUUID(),
      idempotencyKeyDigest: "d".repeat(64),
      generation: 1,
      requestedAt,
      cancelUntil: new Date(requestedAt.getTime() + 168 * 60 * 60 * 1000),
      purgeDueAt: new Date(requestedAt.getTime() + 336 * 60 * 60 * 1000),
    });

    await expect(repository.get(users[0]!, conversation.id)).resolves.toMatchObject({
      peer: { id: users[2], name: "Deleted account" },
      capabilities: { canSend: false, canResolveRequest: false },
    });
  });

  it("projects a detached peer without profile values before physical purge", async () => {
    const [conversation] = await database.db.select({ id: schema.conversations.id })
      .from(schema.conversations)
      .where(or(
        and(eq(schema.conversations.userLowId, users[0]!), eq(schema.conversations.userHighId, users[1]!)),
        and(eq(schema.conversations.userLowId, users[1]!), eq(schema.conversations.userHighId, users[0]!)),
      ))
      .limit(1);
    if (!conversation) throw new Error("Expected a conversation for detached peer projection.");
    await database.db.update(schema.messages).set({ version: 1 })
      .where(eq(schema.messages.conversationId, conversation.id));
    await database.db.update(schema.user).set({
      name: "private name",
      username: "privatehandle",
      displayUsername: "private display name",
      image: "https://example.test/private-avatar.png",
    }).where(eq(schema.user.id, users[1]!));
    // Legacy user foreign keys still cascade on a physical DELETE. This state
    // verifies only the pre-purge reader projection, not message retention.
    await database.db.update(schema.messagingParticipants).set({ userId: null, state: "deleted" })
      .where(eq(schema.messagingParticipants.id, users[1]!));

    await expect(repository.get(users[0]!, conversation.id)).resolves.toMatchObject({
      peer: { id: users[1], name: "Deleted account" },
    });
  });
});
