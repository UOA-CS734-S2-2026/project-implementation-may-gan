import { createDayliDatabase, schema, sql } from "@dayli/db";
import { and, count, eq, inArray, or } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createMessagingPersistenceServices } from "../../../../../app";

const connectionString = process.env.MESSAGING_TEST_DATABASE_URL;
const enabled = Boolean(connectionString);
const target = connectionString ? new URL(connectionString) : undefined;
if (enabled && target?.hostname === "localhost" && target.port === "5433" && target.pathname !== "/dayli_messaging_test") {
  throw new Error("MESSAGING_TEST_DATABASE_URL must use the isolated dayli_messaging_test database.");
}
const suite = enabled ? describe : describe.skip;

suite("create direct conversation Postgres repository", () => {
  const database = createDayliDatabase(connectionString ?? "postgresql://invalid/messaging_tests");
  const concurrentDatabase = createDayliDatabase(connectionString ?? "postgresql://invalid/messaging_tests");
  const mixedCasePrefix = `create-direct-conversation-${crypto.randomUUID()}-`;
  const mixedCaseUsers = [`${mixedCasePrefix}a`, `${mixedCasePrefix}B`] as const;
  const users = [
    ...Array.from({ length: 10 }, (_, index) => `create-direct-conversation-${crypto.randomUUID()}-${index}`),
    ...mixedCaseUsers,
  ];
  const builderQueries: string[] = [];
  const {
    conversations,
    conversationChanges,
    conversationMembers,
    friendRequests,
    friendships,
    messages,
    messagingOutbox,
    relationshipBlocks,
    user,
  } = schema;
  // postgres-js is retained only as Drizzle's transport so this test can observe repository SQL.
  const observedDatabase = drizzle(database.client, {
    schema,
    logger: { logQuery(query) { builderQueries.push(query); } },
  });
  const { direct } = createMessagingPersistenceServices(database.db);
  const { direct: concurrentDirect } = createMessagingPersistenceServices(concurrentDatabase.db);
  const { direct: observedDirect } = createMessagingPersistenceServices(observedDatabase);

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

  it("serializes concurrent creation into one atomic conversation, initial message, members, change and realtime outbox", async () => {
    const clientMessageId = crypto.randomUUID();
    const results = await Promise.all([
      direct.create(users[0]!, { recipientId: users[1]!, clientMessageId, text: "hello" }),
      concurrentDirect.create(users[0]!, { recipientId: users[1]!, clientMessageId, text: "hello" }),
    ]);
    const conversationId = results[0]!.conversation.id;

    expect(new Set(results.map((result) => result.conversation.id))).toEqual(new Set([conversationId]));
    expect(new Set(results.map((result) => result.message.id)).size).toBe(1);
    expect(results.filter((result) => result.replayed)).toHaveLength(1);
    const [messageCount] = await database.db.select({ count: count() }).from(messages).where(eq(messages.conversationId, conversationId));
    const [memberCount] = await database.db.select({ count: count() }).from(conversationMembers).where(eq(conversationMembers.conversationId, conversationId));
    const [changeCount] = await database.db.select({ count: count() }).from(conversationChanges).where(and(
      eq(conversationChanges.conversationId, conversationId),
      eq(conversationChanges.kind, "message.created"),
    ));
    const [outboxCount] = await database.db.select({ count: count() }).from(messagingOutbox).where(and(
      eq(messagingOutbox.conversationId, conversationId),
      eq(messagingOutbox.channel, "realtime"),
    ));
    expect(messageCount?.count).toBe(1);
    expect(memberCount?.count).toBe(2);
    expect(changeCount?.count).toBe(1);
    expect(outboxCount?.count).toBe(2);

    await database.db.insert(friendships).values([
      { userId: users[0]!, friendId: users[1]!, state: "active", stateChangedAt: sql`now()` },
      { userId: users[1]!, friendId: users[0]!, state: "active", stateChangedAt: sql`now()` },
    ]);
    const activated = await direct.create(users[0]!, { recipientId: users[1]!, clientMessageId: crypto.randomUUID(), text: "friendship activated" });
    expect(activated.conversation.requestState).toBe("active");
  });

  it("replays an identical initial request without duplicate persistence or outbox work", async () => {
    const clientMessageId = crypto.randomUUID();
    const created = await direct.create(users[2]!, { recipientId: users[3]!, clientMessageId, text: "replay me" });
    const replayed = await direct.create(users[2]!, { recipientId: users[3]!, clientMessageId, text: "replay me" });

    expect(replayed).toMatchObject({ conversation: { id: created.conversation.id }, message: { id: created.message.id }, replayed: true });
    const [messageCount] = await database.db.select({ count: count() }).from(messages).where(eq(messages.conversationId, created.conversation.id));
    const [changeCount] = await database.db.select({ count: count() }).from(conversationChanges).where(eq(conversationChanges.conversationId, created.conversation.id));
    const [outboxCount] = await database.db.select({ count: count() }).from(messagingOutbox).where(eq(messagingOutbox.conversationId, created.conversation.id));
    expect(messageCount?.count).toBe(1);
    expect(changeCount?.count).toBe(1);
    expect(outboxCount?.count).toBe(2);
  });

  it("uses PostgreSQL pair ordering for mixed-case creation and idempotent resend", async () => {
    const [actorId, recipientId] = mixedCaseUsers;
    const clientMessageId = crypto.randomUUID();
    builderQueries.length = 0;

    const created = await observedDirect.create(actorId, { recipientId, clientMessageId, text: "mixed case" });
    const replayed = await observedDirect.create(actorId, { recipientId, clientMessageId, text: "mixed case" });
    // PostgreSQL collation determines least/greatest ordering; keep it in bounded SQL expressions.
    const reference = await database.db.select({
      lowId: sql<string>`least(${actorId}, ${recipientId})`,
      highId: sql<string>`greatest(${actorId}, ${recipientId})`,
    }).from(sql`(values (1)) as pair_source`);
    const [stored] = await database.db.select({
      lowId: conversations.userLowId,
      highId: conversations.userHighId,
      satisfiesPairOrderCheck: sql<boolean>`${conversations.userLowId} < ${conversations.userHighId}`,
    }).from(conversations).where(eq(conversations.id, created.conversation.id));
    const [referencePair] = reference;
    const queries = builderQueries.map((query) => query.toLowerCase());

    expect(replayed).toMatchObject({
      conversation: { id: created.conversation.id },
      message: { id: created.message.id },
      replayed: true,
    });
    expect(stored).toEqual({
      lowId: referencePair?.lowId,
      highId: referencePair?.highId,
      satisfiesPairOrderCheck: true,
    });
    await expect(database.db.update(conversations).set({
      userLowId: referencePair!.highId,
      userHighId: referencePair!.lowId,
    }).where(eq(conversations.id, created.conversation.id))).rejects.toMatchObject({ cause: { code: "23514" } });
    expect(queries.some((query) => (
      query.startsWith("select") && query.includes("least(") && query.includes("greatest(")
    ))).toBe(true);
    expect(queries.some((query) => (
      query.startsWith("insert into \"conversations\"") && query.includes("least(") && query.includes("greatest(")
    ))).toBe(true);
  });

  it("accepts MAX_SAFE_INTEGER and rolls back a MAX_SAFE_INTEGER + 1 append", async () => {
    const created = await direct.create(users[6]!, {
      recipientId: users[7]!,
      clientMessageId: crypto.randomUUID(),
      text: "first",
    });
    expect(created.message.sequence).toBe("1");
    await database.db.insert(friendships).values([
      { userId: users[6]!, friendId: users[7]!, state: "active", stateChangedAt: sql`now()` },
      { userId: users[7]!, friendId: users[6]!, state: "active", stateChangedAt: sql`now()` },
    ]);
    await database.db.update(conversations).set({ lastMessageSequence: Number.MAX_SAFE_INTEGER - 1 }).where(eq(conversations.id, created.conversation.id));

    const appended = await direct.create(users[6]!, {
      recipientId: users[7]!,
      clientMessageId: crypto.randomUUID(),
      text: "maximum safe",
    });

    expect(appended.message.sequence).toBe(String(Number.MAX_SAFE_INTEGER));
    const [maximumSafeMessage] = await database.db.select({ sequence: sql<string>`${messages.sequence}::text` }).from(messages).where(eq(messages.id, appended.message.id));
    expect(maximumSafeMessage?.sequence).toBe(String(Number.MAX_SAFE_INTEGER));

    const [beforeMessages] = await database.db.select({ count: count() }).from(messages).where(eq(messages.conversationId, created.conversation.id));
    const [beforeChanges] = await database.db.select({ count: count() }).from(conversationChanges).where(eq(conversationChanges.conversationId, created.conversation.id));
    const [beforeOutbox] = await database.db.select({ count: count() }).from(messagingOutbox).where(eq(messagingOutbox.conversationId, created.conversation.id));

    await expect(direct.create(users[6]!, {
      recipientId: users[7]!,
      clientMessageId: crypto.randomUUID(),
      text: "overflow",
    })).rejects.toThrow("Database sequence must be a safe nonnegative integer.");

    const [conversation] = await database.db.select({ sequence: sql<string>`${conversations.lastMessageSequence}::text` }).from(conversations).where(eq(conversations.id, created.conversation.id));
    const [messageCount] = await database.db.select({ count: count() }).from(messages).where(eq(messages.conversationId, created.conversation.id));
    const [changeCount] = await database.db.select({ count: count() }).from(conversationChanges).where(eq(conversationChanges.conversationId, created.conversation.id));
    const [outboxCount] = await database.db.select({ count: count() }).from(messagingOutbox).where(eq(messagingOutbox.conversationId, created.conversation.id));
    expect(conversation?.sequence).toBe(String(Number.MAX_SAFE_INTEGER));
    expect(messageCount?.count).toBe(beforeMessages?.count);
    expect(changeCount?.count).toBe(beforeChanges?.count);
    expect(outboxCount?.count).toBe(beforeOutbox?.count);
  });

  it("fails closed for an unsafe idempotent message row", async () => {
    const clientMessageId = crypto.randomUUID();
    const created = await direct.create(users[8]!, {
      recipientId: users[9]!,
      clientMessageId,
      text: "unsafe replay",
    });
    // bigint(mode: number) cannot represent this value; keep the bounded SQL expression in a typed update.
    await database.db.update(messages).set({ sequence: sql`9007199254740992::bigint` }).where(eq(messages.id, created.message.id));
    const [beforeChanges] = await database.db.select({ count: count() }).from(conversationChanges).where(eq(conversationChanges.conversationId, created.conversation.id));
    const [beforeOutbox] = await database.db.select({ count: count() }).from(messagingOutbox).where(eq(messagingOutbox.conversationId, created.conversation.id));

    await expect(direct.create(users[8]!, {
      recipientId: users[9]!,
      clientMessageId,
      text: "unsafe replay",
    })).rejects.toThrow("Database sequence must be a safe nonnegative integer.");

    const [conversation] = await database.db.select({ sequence: sql<string>`${conversations.lastMessageSequence}::text` }).from(conversations).where(eq(conversations.id, created.conversation.id));
    const [message] = await database.db.select({ sequence: sql<string>`${messages.sequence}::text` }).from(messages).where(eq(messages.id, created.message.id));
    const [changeCount] = await database.db.select({ count: count() }).from(conversationChanges).where(eq(conversationChanges.conversationId, created.conversation.id));
    const [outboxCount] = await database.db.select({ count: count() }).from(messagingOutbox).where(eq(messagingOutbox.conversationId, created.conversation.id));
    expect(conversation?.sequence).toBe("1");
    expect(message?.sequence).toBe("9007199254740992");
    expect(changeCount?.count).toBe(beforeChanges?.count);
    expect(outboxCount?.count).toBe(beforeOutbox?.count);
  });

  it("rejects creation after either-direction blocks", async () => {
    await database.db.insert(relationshipBlocks).values({
      blockerId: users[5]!,
      blockedId: users[4]!,
      blockedAt: sql`now()`,
    });
    await expect(direct.create(users[4]!, { recipientId: users[5]!, clientMessageId: crypto.randomUUID(), text: "blocked" })).rejects.toMatchObject({ code: "BLOCKED" });
  });
});
