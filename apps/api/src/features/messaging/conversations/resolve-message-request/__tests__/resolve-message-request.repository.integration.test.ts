import { createDayliDatabase, schema, sql } from "@dayli/db";
import { and, count, eq, inArray, or } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createMessagingPersistenceServices } from "../../../../../app";
import { createPostgresResolveMessageRequestRepository } from "../resolve-message-request.repository";

const connectionString = process.env.MESSAGING_TEST_DATABASE_URL;
const enabled = Boolean(connectionString);
const target = connectionString ? new URL(connectionString) : undefined;
if (enabled && target?.hostname === "localhost" && target.port === "5433" && target.pathname !== "/dayli_messaging_test") {
  throw new Error("MESSAGING_TEST_DATABASE_URL must use the isolated dayli_messaging_test database.");
}
const suite = enabled ? describe : describe.skip;

suite("resolve message request Postgres repository", () => {
  const database = createDayliDatabase(connectionString ?? "postgresql://invalid/messaging_tests");
  const concurrentDatabase = createDayliDatabase(connectionString ?? "postgresql://invalid/messaging_tests");
  const users = Array.from({ length: 13 }, (_, index) => `resolve-message-request-${crypto.randomUUID()}-${index}`);
  const {
    conversationChanges,
    conversationMembers,
    conversations,
    friendRequests,
    friendships,
    messages,
    messagingOutbox,
    relationshipBlocks,
    user,
  } = schema;
  const { direct } = createMessagingPersistenceServices(database.db);
  const repository = createPostgresResolveMessageRequestRepository(database.db);
  const concurrentRepository = createPostgresResolveMessageRequestRepository(concurrentDatabase.db);
  const builderQueries: string[] = [];
  // postgres-js is retained only as Drizzle's transport so this test can observe repository SQL.
  const observedRepository = createPostgresResolveMessageRequestRepository(drizzle(database.client, {
    schema,
    logger: { logQuery(query) { builderQueries.push(query); } },
  }));

  beforeAll(async () => {
    await database.db.insert(user).values(users.map((id) => ({ id, name: id, email: `${id}@example.test` })));
  });

  afterAll(async () => {
    try {
      await database.db.delete(relationshipBlocks).where(or(
        inArray(relationshipBlocks.blockerId, users),
        inArray(relationshipBlocks.blockedId, users),
      ));
      await database.db.delete(friendships).where(or(
        inArray(friendships.userId, users),
        inArray(friendships.friendId, users),
      ));
      await database.db.delete(friendRequests).where(or(
        inArray(friendRequests.senderId, users),
        inArray(friendRequests.recipientId, users),
      ));
      await database.db.delete(user).where(inArray(user.id, users));
    } finally {
      await concurrentDatabase.close();
      await database.close();
    }
  });

  it("accepts a pending request, persists its change and projects after commit", async () => {
    const created = await direct.create(users[0]!, {
      recipientId: users[1]!,
      clientMessageId: crypto.randomUUID(),
      text: "accept me",
    });

    await expect(repository.resolve(users[1]!, created.conversation.id, "accept")).resolves.toMatchObject({
      id: created.conversation.id,
      requestState: "active",
      capabilities: { canSend: true, canResolveRequest: false },
    });
    await expect(repository.resolve(users[1]!, created.conversation.id, "accept")).resolves.toMatchObject({
      id: created.conversation.id,
      requestState: "active",
    });
    const [changeCount] = await database.db.select({ count: count() }).from(conversationChanges).where(and(
      eq(conversationChanges.conversationId, created.conversation.id),
      eq(conversationChanges.kind, "request.active"),
    ));
    const [outboxCount] = await database.db.select({ count: count() }).from(messagingOutbox).where(eq(messagingOutbox.conversationId, created.conversation.id));
    expect(changeCount?.count).toBe(1);
    expect(outboxCount?.count).toBe(4);
  });

  it("uses native response reads at MAX_SAFE_INTEGER", async () => {
    const created = await direct.create(users[9]!, {
      recipientId: users[10]!,
      clientMessageId: crypto.randomUUID(),
      text: "high sequence",
    });
    const maximumSafeSequence = "9007199254740991";
    const previousSequence = "9007199254740990";
    await database.db.update(messages).set({
      sequence: Number(maximumSafeSequence),
      version: Number(maximumSafeSequence),
    }).where(eq(messages.id, created.message.id));
    await database.db.update(conversations).set({
      lastMessageSequence: Number(maximumSafeSequence),
      lastChangeSequence: Number(previousSequence),
    }).where(eq(conversations.id, created.conversation.id));
    await database.db.update(conversationMembers).set({
      lastReadSequence: Number(previousSequence),
      receiptSequence: Number(previousSequence),
    }).where(and(
      eq(conversationMembers.conversationId, created.conversation.id),
      eq(conversationMembers.participantId, users[10]!),
    ));

    builderQueries.length = 0;
    await expect(observedRepository.resolve(users[10]!, created.conversation.id, "accept")).resolves.toMatchObject({
      id: created.conversation.id,
      requestState: "active",
      latestMessage: { id: created.message.id, sequence: maximumSafeSequence, version: Number.MAX_SAFE_INTEGER },
      unreadCount: 1,
      lastMessageSequence: maximumSafeSequence,
      lastChangeSequence: maximumSafeSequence,
      lastReadSequence: previousSequence,
      receiptSequence: previousSequence,
    });
    expect(builderQueries).toHaveLength(13);
    const responseQueries = builderQueries.slice(-5);
    expect(responseQueries).toHaveLength(5);
    const latestQuery = responseQueries.find((query) => query.includes('order by "messages"."sequence" desc'));
    const unreadQuery = responseQueries.find((query) => query.includes("count(*)"));
    expect(latestQuery).toBeDefined();
    expect(latestQuery).not.toContain("::text");
    expect(unreadQuery).toBeDefined();
    expect(unreadQuery).not.toContain("::int");
    expect(unreadQuery).not.toContain("::bigint");
  });

  it("rolls back resolution state and outbox work when the change sequence overflows", async () => {
    const created = await direct.create(users[11]!, {
      recipientId: users[12]!,
      clientMessageId: crypto.randomUUID(),
      text: "overflow resolution",
    });
    await database.db.update(conversations).set({ lastChangeSequence: Number.MAX_SAFE_INTEGER }).where(eq(conversations.id, created.conversation.id));

    await expect(repository.resolve(users[12]!, created.conversation.id, "accept"))
      .rejects.toThrow("Database sequence must be a safe nonnegative integer.");

    const [conversation] = await database.db.select({
      requestState: conversations.requestState,
      lastChangeSequence: conversations.lastChangeSequence,
    }).from(conversations).where(eq(conversations.id, created.conversation.id));
    const [changeCount] = await database.db.select({ count: count() }).from(conversationChanges).where(eq(conversationChanges.conversationId, created.conversation.id));
    const [outboxCount] = await database.db.select({ count: count() }).from(messagingOutbox).where(eq(messagingOutbox.conversationId, created.conversation.id));
    expect(conversation).toMatchObject({ requestState: "pending" });
    expect(String(conversation?.lastChangeSequence)).toBe("9007199254740991");
    expect(changeCount?.count).toBe(1);
    expect(outboxCount?.count).toBe(2);
  });

  it("declines once and treats the recipient retry as a no-op", async () => {
    const created = await direct.create(users[2]!, {
      recipientId: users[3]!,
      clientMessageId: crypto.randomUUID(),
      text: "decline me",
    });

    await expect(repository.resolve(users[3]!, created.conversation.id, "decline")).resolves.toMatchObject({ requestState: "declined" });
    await expect(repository.resolve(users[3]!, created.conversation.id, "decline")).resolves.toMatchObject({ requestState: "declined" });
    const [changeCount] = await database.db.select({ count: count() }).from(conversationChanges).where(and(
      eq(conversationChanges.conversationId, created.conversation.id),
      eq(conversationChanges.kind, "request.declined"),
    ));
    const [outboxCount] = await database.db.select({ count: count() }).from(messagingOutbox).where(eq(messagingOutbox.conversationId, created.conversation.id));
    expect(changeCount?.count).toBe(1);
    expect(outboxCount?.count).toBe(4);
  });

  it("rejects blocked resolution without exposing a new change", async () => {
    const created = await direct.create(users[4]!, {
      recipientId: users[5]!,
      clientMessageId: crypto.randomUUID(),
      text: "blocked request",
    });
    await database.db.insert(relationshipBlocks).values({
      blockerId: users[4]!,
      blockedId: users[5]!,
      blockedAt: sql`now()`,
    });

    const resolutions = await Promise.allSettled([
      repository.resolve(users[5]!, created.conversation.id, "accept"),
      concurrentRepository.resolve(users[5]!, created.conversation.id, "accept"),
    ]);
    for (const resolution of resolutions) {
      expect(resolution).toMatchObject({ status: "rejected", reason: { code: "BLOCKED" } });
    }
    const [conversation] = await database.db.select({ requestState: conversations.requestState }).from(conversations).where(eq(conversations.id, created.conversation.id));
    const [changeCount] = await database.db.select({ count: count() }).from(conversationChanges).where(eq(conversationChanges.conversationId, created.conversation.id));
    expect(conversation).toMatchObject({ requestState: "pending" });
    expect(changeCount?.count).toBe(1);
  });

  it("keeps non-members private and forbids the request initiator", async () => {
    const created = await direct.create(users[0]!, {
      recipientId: users[1]!,
      clientMessageId: crypto.randomUUID(),
      text: "private request",
    });

    await expect(repository.resolve(users[8]!, created.conversation.id, "accept")).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(repository.resolve(users[0]!, created.conversation.id, "accept")).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("serializes concurrent identical resolutions into one accepted change", async () => {
    const created = await direct.create(users[6]!, {
      recipientId: users[7]!,
      clientMessageId: crypto.randomUUID(),
      text: "race request",
    });

    await expect(Promise.all([
      repository.resolve(users[7]!, created.conversation.id, "accept"),
      concurrentRepository.resolve(users[7]!, created.conversation.id, "accept"),
    ])).resolves.toEqual([
      expect.objectContaining({ requestState: "active" }),
      expect.objectContaining({ requestState: "active" }),
    ]);
    const [changeCount] = await database.db.select({ count: count() }).from(conversationChanges).where(and(
      eq(conversationChanges.conversationId, created.conversation.id),
      eq(conversationChanges.kind, "request.active"),
    ));
    const [conversation] = await database.db.select({ requestState: conversations.requestState }).from(conversations).where(eq(conversations.id, created.conversation.id));
    expect(changeCount?.count).toBe(1);
    expect(conversation).toMatchObject({ requestState: "active" });
  });
});
