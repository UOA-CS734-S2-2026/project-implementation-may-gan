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

async function waitFor(condition: () => Promise<boolean>, message: string): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (await condition()) return;
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
  throw new Error(message);
}

suite("create direct conversation Postgres repository", () => {
  const database = createDayliDatabase(connectionString ?? "postgresql://invalid/messaging_tests");
  const concurrentDatabase = createDayliDatabase(connectionString ?? "postgresql://invalid/messaging_tests");
  const mixedCasePrefix = `create-direct-conversation-${crypto.randomUUID()}-`;
  const mixedCaseUsers = [`${mixedCasePrefix}a`, `${mixedCasePrefix}B`] as const;
  const users = [
    ...Array.from({ length: 16 }, (_, index) => `create-direct-conversation-${crypto.randomUUID()}-${index}`),
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

  it("writes divergent participant identities beside legacy direct-create fields and replays by participant", async () => {
    const actorId = users[14]!;
    const recipientId = users[15]!;
    const lowParticipantId = `a-participant-${crypto.randomUUID()}`;
    const highParticipantId = `z-participant-${crypto.randomUUID()}`;
    const actorParticipantId = actorId < recipientId ? lowParticipantId : highParticipantId;
    const recipientParticipantId = actorId < recipientId ? highParticipantId : lowParticipantId;
    await database.db.update(schema.messagingParticipants).set({ id: actorParticipantId })
      .where(eq(schema.messagingParticipants.userId, actorId));
    await database.db.update(schema.messagingParticipants).set({ id: recipientParticipantId })
      .where(eq(schema.messagingParticipants.userId, recipientId));

    const clientMessageId = crypto.randomUUID();
    const created = await direct.create(actorId, { recipientId, clientMessageId, text: "durable direct create" });
    const replayed = await direct.create(actorId, { recipientId, clientMessageId, text: "durable direct create" });
    const [stored] = await database.db.select({
      userLowId: conversations.userLowId,
      userHighId: conversations.userHighId,
      participantLowId: conversations.participantLowId,
      participantHighId: conversations.participantHighId,
      initiatorParticipantId: conversations.initiatorParticipantId,
      senderId: messages.senderId,
      senderParticipantId: messages.senderParticipantId,
    }).from(conversations)
      .innerJoin(messages, eq(messages.conversationId, conversations.id))
      .where(eq(conversations.id, created.conversation.id));
    const members = await database.db.select({ userId: conversationMembers.userId, participantId: conversationMembers.participantId })
      .from(conversationMembers)
      .where(eq(conversationMembers.conversationId, created.conversation.id));

    expect(replayed).toMatchObject({ replayed: true, message: { id: created.message.id } });
    expect(stored).toMatchObject({
      userLowId: actorId < recipientId ? actorId : recipientId,
      userHighId: actorId < recipientId ? recipientId : actorId,
      participantLowId: lowParticipantId,
      participantHighId: highParticipantId,
      initiatorParticipantId: actorParticipantId,
      senderId: actorId,
      senderParticipantId: actorParticipantId,
    });
    expect(members).toEqual(expect.arrayContaining([
      { userId: actorId, participantId: actorParticipantId },
      { userId: recipientId, participantId: recipientParticipantId },
    ]));
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
      query.startsWith("select") && query.includes("case when") && query.includes("participant_low_id")
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

  it("waits for a lifecycle transition before refusing direct creation", async () => {
    const actorId = users[10]!;
    const recipientId = users[11]!;
    const holder = createDayliDatabase(connectionString!);
    const inspector = createDayliDatabase(connectionString!);
    let release: (() => void) | undefined;
    const held = new Promise<void>((resolve) => { release = resolve; });
    let lifecycleWritten: (() => void) | undefined;
    const written = new Promise<void>((resolve) => { lifecycleWritten = resolve; });
    try {
      const [holderBackend] = await holder.client`select pg_backend_pid() as pid`;
      const [contenderBackend] = await concurrentDatabase.client`select pg_backend_pid() as pid`;
      const holderPid = Number(holderBackend?.pid);
      const contenderPid = Number(contenderBackend?.pid);
      const transition = holder.client.begin(async (tx) => {
        await tx`select id from public."user" where id = ${recipientId} for update`;
        await tx`
          insert into public.account_lifecycles
            (user_id, state, request_id, idempotency_key_digest, generation, requested_at, cancel_until, purge_due_at)
          values (${recipientId}, 'pending_deletion', ${crypto.randomUUID()}, ${"e".repeat(64)}, 1, now(), now() + interval '168 hours', now() + interval '336 hours')
        `;
        lifecycleWritten?.();
        await held;
      });
      await written;
      const created = concurrentDirect.create(actorId, { recipientId, clientMessageId: crypto.randomUUID(), text: "must wait for lifecycle" });
      await waitFor(async () => {
        const [row] = await inspector.client`select ${holderPid} = any(pg_blocking_pids(${contenderPid})) as blocked`;
        return row?.blocked === true;
      }, "Expected direct creation to wait for the lifecycle user lock.");
      release!();
      await transition;
      await expect(created).rejects.toMatchObject({ code: "FORBIDDEN" });
      const [createdCount] = await database.db.select({ count: count() }).from(conversations).where(and(
        eq(conversations.userLowId, sql`least(${actorId}, ${recipientId})`),
        eq(conversations.userHighId, sql`greatest(${actorId}, ${recipientId})`),
      ));
      expect(createdCount?.count).toBe(0);
    } finally {
      release?.();
      await database.db.delete(schema.accountLifecycles).where(eq(schema.accountLifecycles.userId, recipientId));
      await Promise.all([holder.close(), inspector.close()]);
    }
  });

  it("rejects a lifecycle-unavailable direct creation replay without duplicating persistence", async () => {
    const actorId = users[12]!;
    const recipientId = users[13]!;
    const clientMessageId = crypto.randomUUID();
    const created = await direct.create(actorId, { recipientId, clientMessageId, text: "replay after lifecycle" });
    const requestedAt = new Date();
    await database.db.insert(schema.accountLifecycles).values({
      userId: recipientId, state: "pending_deletion", requestId: crypto.randomUUID(),
      idempotencyKeyDigest: "e".repeat(64), generation: 1, requestedAt,
      cancelUntil: new Date(requestedAt.getTime() + 168 * 60 * 60 * 1000),
      purgeDueAt: new Date(requestedAt.getTime() + 336 * 60 * 60 * 1000),
    });
    try {
      await expect(direct.create(actorId, { recipientId, clientMessageId, text: "replay after lifecycle" }))
        .rejects.toMatchObject({ code: "FORBIDDEN" });
      const [messageCount] = await database.db.select({ count: count() }).from(messages)
        .where(eq(messages.conversationId, created.conversation.id));
      expect(messageCount?.count).toBe(1);
    } finally {
      await database.db.delete(schema.accountLifecycles).where(eq(schema.accountLifecycles.userId, recipientId));
    }
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
