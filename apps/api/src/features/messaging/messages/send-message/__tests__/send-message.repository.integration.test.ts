import { createDayliDatabase, schema } from "@dayli/db";
import { and, asc, count, eq, inArray, or, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createMessagingPersistenceServices } from "../../../../../app";
import { createPostgresMessageWriteStore } from "../send-message.repository";
import { createSendMessageService } from "../send-message.service";

const {
  conversationChanges,
  conversations,
  friendRequests,
  friendships,
  messages,
  messagingOutbox,
  relationshipBlocks,
  user,
} = schema;
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

suite("send message Postgres repository", () => {
  const database = createDayliDatabase(connectionString ?? "postgresql://invalid/messaging_tests");
  const contender = createDayliDatabase(connectionString ?? "postgresql://invalid/messaging_tests");
  const users = Array.from({ length: 12 }, (_, index) => `send-message-${crypto.randomUUID()}-${index}`);
  const durableUsers = [users[10]!, users[11]!].sort();
  const durableParticipantIds = new Map([
    [durableUsers[0]!, `a-send-message-participant-${crypto.randomUUID()}`],
    [durableUsers[1]!, `z-send-message-participant-${crypto.randomUUID()}`],
  ]);
  const { direct } = createMessagingPersistenceServices(database.db);
  const send = createSendMessageService({ store: createPostgresMessageWriteStore(database.db) });
  const contenderSend = createSendMessageService({ store: createPostgresMessageWriteStore(contender.db) });

  beforeAll(async () => {
    await database.db.insert(user).values(users.map((id) => ({ id, name: id, email: `${id}@example.test` })));
    for (const [userId, participantId] of durableParticipantIds) {
      await database.db.update(schema.messagingParticipants).set({ id: participantId })
        .where(eq(schema.messagingParticipants.userId, userId));
    }
    await database.db.insert(friendships).values([
      { userId: users[0]!, friendId: users[1]!, state: "active", stateChangedAt: new Date() },
      { userId: users[1]!, friendId: users[0]!, state: "active", stateChangedAt: new Date() },
      { userId: users[2]!, friendId: users[3]!, state: "active", stateChangedAt: new Date() },
      { userId: users[3]!, friendId: users[2]!, state: "active", stateChangedAt: new Date() },
      { userId: users[2]!, friendId: users[8]!, state: "active", stateChangedAt: new Date() },
      { userId: users[8]!, friendId: users[2]!, state: "active", stateChangedAt: new Date() },
      { userId: users[0]!, friendId: users[4]!, state: "active", stateChangedAt: new Date() },
      { userId: users[4]!, friendId: users[0]!, state: "active", stateChangedAt: new Date() },
      { userId: users[0]!, friendId: users[5]!, state: "active", stateChangedAt: new Date() },
      { userId: users[5]!, friendId: users[0]!, state: "active", stateChangedAt: new Date() },
      { userId: users[6]!, friendId: users[7]!, state: "active", stateChangedAt: new Date() },
      { userId: users[7]!, friendId: users[6]!, state: "active", stateChangedAt: new Date() },
      { userId: users[8]!, friendId: users[9]!, state: "active", stateChangedAt: new Date() },
      { userId: users[9]!, friendId: users[8]!, state: "active", stateChangedAt: new Date() },
      { userId: users[10]!, friendId: users[11]!, state: "active", stateChangedAt: new Date() },
      { userId: users[11]!, friendId: users[10]!, state: "active", stateChangedAt: new Date() },
    ]);
  });

  afterAll(async () => {
    try {
      await database.db.delete(relationshipBlocks).where(or(inArray(relationshipBlocks.blockerId, users), inArray(relationshipBlocks.blockedId, users)));
      await database.db.delete(friendships).where(or(inArray(friendships.userId, users), inArray(friendships.friendId, users)));
      await database.db.delete(friendRequests).where(or(inArray(friendRequests.senderId, users), inArray(friendRequests.recipientId, users)));
      await database.db.delete(user).where(inArray(user.id, users));
    } finally {
      await Promise.all([database.close(), contender.close()]);
    }
  });

  it("enforces membership and atomically persists replies, idempotency, sequence, and realtime outbox work", async () => {
    const created = await direct.create(users[0]!, {
      recipientId: users[1]!,
      clientMessageId: crypto.randomUUID(),
      text: "first",
    });

    await expect(send.send(users[2]!, created.conversation.id, {
      clientMessageId: crypto.randomUUID(),
      text: "not a member",
    })).rejects.toMatchObject({ code: "NOT_FOUND" });

    await expect(send.send(users[0]!, created.conversation.id, {
      clientMessageId: crypto.randomUUID(),
      text: "missing parent",
      replyToMessageId: crypto.randomUUID(),
    })).rejects.toMatchObject({ code: "REPLY_NOT_FOUND" });

    const clientMessageId = crypto.randomUUID();
    const first = await send.send(users[0]!, created.conversation.id, {
      clientMessageId,
      text: "a reply",
      replyToMessageId: created.message.id,
    });
    expect(first).toMatchObject({
      replayed: false,
      message: { sequence: "2", replyToMessageId: created.message.id, text: "a reply" },
    });

    const replay = await send.send(users[0]!, created.conversation.id, {
      clientMessageId,
      text: "a reply",
      replyToMessageId: created.message.id,
    });
    expect(replay).toMatchObject({ replayed: true, message: { id: first.message.id, sequence: "2" } });

    await expect(send.send(users[0]!, created.conversation.id, {
      clientMessageId,
      text: "different payload",
      replyToMessageId: created.message.id,
    })).rejects.toMatchObject({ code: "IDEMPOTENCY_KEY_REUSED" });

    const [stored] = await database.db.select({ sequence: messages.sequence, replyToMessageId: messages.replyToMessageId }).from(messages).where(eq(messages.id, first.message.id));
    const changes = await database.db.select({ changeSequence: conversationChanges.changeSequence, kind: conversationChanges.kind, messageId: conversationChanges.messageId }).from(conversationChanges).where(eq(conversationChanges.conversationId, created.conversation.id)).orderBy(asc(conversationChanges.changeSequence));
    const [outbox] = await database.db.select({ count: count() }).from(messagingOutbox).where(and(eq(messagingOutbox.conversationId, created.conversation.id), eq(messagingOutbox.channel, "realtime")));
    expect(String(stored?.sequence)).toBe("2");
    expect(stored?.replyToMessageId).toBe(created.message.id);
    expect(changes).toMatchObject([
      { changeSequence: 1, kind: "message.created", messageId: created.message.id },
      { changeSequence: 2, kind: "message.created", messageId: first.message.id },
    ]);
    expect(outbox?.count).toBe(4);
  });

  it("atomically caps mixed cross-conversation sends and keeps replay and other senders eligible", async () => {
    const actorId = users[2]!;
    const primary = createMessagingPersistenceServices(database.db, { messageSendLimit: 30 });
    const secondary = createMessagingPersistenceServices(contender.db, { messageSendLimit: 30 });
    const first = await primary.direct.create(actorId, {
      recipientId: users[3]!, clientMessageId: crypto.randomUUID(), text: "first conversation",
    });
    const second = await secondary.direct.create(actorId, {
      recipientId: users[8]!, clientMessageId: crypto.randomUUID(), text: "second conversation",
    });
    const clientIds = Array.from({ length: 32 }, () => crypto.randomUUID());
    const attempts = await Promise.allSettled(clientIds.map((clientMessageId, index) => {
      const service = index % 2 === 0 ? primary.send : secondary.send;
      const conversationId = index % 2 === 0 ? first.conversation.id : second.conversation.id;
      return service.send(actorId, conversationId, { clientMessageId, text: `quota ${index}` });
    }));
    expect(attempts.filter((result) => result.status === "fulfilled")).toHaveLength(28);
    expect(attempts.filter((result) => result.status === "rejected").map((result) => (result as PromiseRejectedResult).reason.code))
      .toEqual(["RATE_LIMITED", "RATE_LIMITED", "RATE_LIMITED", "RATE_LIMITED"]);
    const [persisted] = await database.db.select({ count: count() }).from(messages).where(eq(messages.senderId, actorId));
    expect(persisted?.count).toBe(30);

    const acceptedIndex = attempts.findIndex((result) => result.status === "fulfilled");
    const accepted = attempts[acceptedIndex] as PromiseFulfilledResult<Awaited<ReturnType<typeof primary.send.send>>>;
    const acceptedConversationId = acceptedIndex % 2 === 0 ? first.conversation.id : second.conversation.id;
    await expect(primary.send.send(actorId, acceptedConversationId, {
      clientMessageId: clientIds[acceptedIndex]!, text: `quota ${acceptedIndex}`,
    })).resolves.toMatchObject({ replayed: true, message: { id: accepted.value.message.id } });
    await expect(primary.send.send(actorId, acceptedConversationId, {
      clientMessageId: clientIds[acceptedIndex]!, text: "conflicting replay",
    })).rejects.toMatchObject({ code: "IDEMPOTENCY_KEY_REUSED" });

    await database.db.update(messages).set({ body: null, unsentAt: new Date() }).where(eq(messages.id, accepted.value.message.id));
    await expect(primary.send.send(actorId, acceptedConversationId, {
      clientMessageId: crypto.randomUUID(), text: "tombstone still counts",
    })).rejects.toMatchObject({ code: "RATE_LIMITED" });
    await expect(primary.send.send(users[3]!, first.conversation.id, {
      clientMessageId: crypto.randomUUID(), text: "independent sender",
    })).resolves.toMatchObject({ replayed: false });

    await database.db.execute(sql`
      insert into messages (id, conversation_id, sequence, sender_id, client_message_id, request_fingerprint, body, version, created_at)
      select 'quota-plan-' || n::text, ${first.conversation.id}, 100000 + n, ${users[3]!},
        'quota-plan-client-' || n::text, 'quota-plan-fingerprint-' || n::text, 'history', 1,
        clock_timestamp() - case when n % 4 = 0 then interval '30 seconds' else interval '2 hours' end
      from generate_series(1, 3000) n
      on conflict do nothing
    `);
    await database.db.execute(sql`analyze messages`);
    const [planRow] = await database.client`
      explain (analyze, format json)
      select count(*), min(created_at) from messages
      where sender_id = ${actorId} and created_at >= clock_timestamp() - interval '60 seconds'
    `;
    expect(JSON.stringify(planRow?.["QUERY PLAN"])).toContain("messages_sender_created_at_idx");

    await database.db.execute(sql`update messages set created_at = clock_timestamp() - interval '59.5 seconds' where sender_id = ${actorId}`);
    const holder = createDayliDatabase(connectionString!);
    let releaseSenderLock: (() => void) | undefined;
    const heldSenderLock = new Promise<void>((resolve) => { releaseSenderLock = resolve; });
    let senderLockAcquired: (() => void) | undefined;
    const acquiredSenderLock = new Promise<void>((resolve) => { senderLockAcquired = resolve; });
    const lockKey = `direct-message-send:${actorId.length}:${actorId}`;
    try {
      const blocker = holder.db.transaction(async (transaction) => {
        await transaction.execute(sql`select pg_advisory_xact_lock(hashtextextended(${lockKey}, 734))`);
        senderLockAcquired?.();
        await heldSenderLock;
      });
      await acquiredSenderLock;
      const delayedSend = primary.send.send(actorId, first.conversation.id, {
        clientMessageId: crypto.randomUUID(), text: "sample time after sender lock wait",
      });
      await new Promise((resolve) => setTimeout(resolve, 1_100));
      releaseSenderLock!();
      await blocker;
      await expect(delayedSend).resolves.toMatchObject({ replayed: false });
    } finally {
      releaseSenderLock?.();
      await holder.close();
    }
  }, 30_000);

  it("sends and replays by a divergent participant while retaining its legacy sender and change actor", async () => {
    const actorId = users[10]!;
    const recipientId = users[11]!;
    const created = await direct.create(actorId, {
      recipientId, clientMessageId: crypto.randomUUID(), text: "durable first",
    });
    const clientMessageId = crypto.randomUUID();
    const sent = await send.send(actorId, created.conversation.id, { clientMessageId, text: "durable send" });
    const replayed = await send.send(actorId, created.conversation.id, { clientMessageId, text: "durable send" });
    const [stored] = await database.db.select({
      senderId: messages.senderId,
      senderParticipantId: messages.senderParticipantId,
      memberId: conversationChanges.memberId,
      memberParticipantId: conversationChanges.memberParticipantId,
    }).from(messages)
      .innerJoin(conversationChanges, eq(conversationChanges.messageId, messages.id))
      .where(eq(messages.id, sent.message.id));

    expect(replayed).toMatchObject({ replayed: true, message: { id: sent.message.id } });
    expect(stored).toEqual({
      senderId: actorId,
      senderParticipantId: durableParticipantIds.get(actorId),
      memberId: null,
      memberParticipantId: null,
    });
  });

  it("serializes concurrent sends from two PostgreSQL clients without losing message or change sequences", async () => {
    const created = await direct.create(users[0]!, {
      recipientId: users[1]!,
      clientMessageId: crypto.randomUUID(),
      text: "first",
    });

    const [beforeChanges] = await database.db.select({ count: count() }).from(conversationChanges).where(eq(conversationChanges.conversationId, created.conversation.id));
    const [beforeOutbox] = await database.db.select({ count: count() }).from(messagingOutbox).where(and(eq(messagingOutbox.conversationId, created.conversation.id), eq(messagingOutbox.channel, "realtime")));
    const results = await Promise.all([
      send.send(users[0]!, created.conversation.id, { clientMessageId: crypto.randomUUID(), text: "from first client" }),
      contenderSend.send(users[1]!, created.conversation.id, { clientMessageId: crypto.randomUUID(), text: "from second client" }),
    ]);

    const initialSequence = BigInt(created.message.sequence);
    const expectedSequences = [(initialSequence + 1n).toString(), (initialSequence + 2n).toString()];
    expect(results.map((result) => result.message.sequence).sort()).toEqual(expectedSequences);
    const storedMessages = await database.db.select({ sequence: messages.sequence }).from(messages).where(inArray(messages.id, [results[0].message.id, results[1].message.id])).orderBy(asc(messages.sequence));
    const changes = await database.db.select({ sequence: conversationChanges.changeSequence }).from(conversationChanges).where(inArray(conversationChanges.messageId, [results[0].message.id, results[1].message.id])).orderBy(asc(conversationChanges.changeSequence));
    const [afterChanges] = await database.db.select({ count: count() }).from(conversationChanges).where(eq(conversationChanges.conversationId, created.conversation.id));
    const [outbox] = await database.db.select({ count: count() }).from(messagingOutbox).where(and(eq(messagingOutbox.conversationId, created.conversation.id), eq(messagingOutbox.channel, "realtime")));
    expect(storedMessages.map((message) => String(message.sequence))).toEqual(expectedSequences);
    expect(changes.map((change) => String(change.sequence))).toEqual(expectedSequences);
    expect(afterChanges?.count).toBe((beforeChanges?.count ?? 0) + 2);
    expect(outbox?.count).toBe((beforeOutbox?.count ?? 0) + 4);
  });

  it("waits for a concurrent lifecycle transition, then rejects the positive send", async () => {
    const created = await direct.create(users[0]!, {
      recipientId: users[1]!, clientMessageId: crypto.randomUUID(), text: "lifecycle contender",
    });
    const [beforeMessageCount] = await database.db.select({ count: count() }).from(messages)
      .where(eq(messages.conversationId, created.conversation.id));
    const holder = createDayliDatabase(connectionString!);
    const inspector = createDayliDatabase(connectionString!);
    let release: (() => void) | undefined;
    const held = new Promise<void>((resolve) => { release = resolve; });
    let lifecycleWritten: (() => void) | undefined;
    const written = new Promise<void>((resolve) => { lifecycleWritten = resolve; });
    try {
      const [holderBackend] = await holder.client`select pg_backend_pid() as pid`;
      const [contenderBackend] = await contender.client`select pg_backend_pid() as pid`;
      const holderPid = Number(holderBackend?.pid);
      const contenderPid = Number(contenderBackend?.pid);
      const requestId = crypto.randomUUID();
      const transition = holder.client.begin(async (tx) => {
        await tx`select id from public."user" where id = ${users[1]!} for update`;
        await tx`
          insert into public.account_lifecycles
            (user_id, state, request_id, idempotency_key_digest, generation, requested_at, cancel_until, purge_due_at)
          values (${users[1]!}, 'pending_deletion', ${requestId}, ${"e".repeat(64)}, 1, now(), now() + interval '168 hours', now() + interval '336 hours')
        `;
        lifecycleWritten?.();
        await held;
      });
      await written;
      const outcome = contenderSend.send(users[0]!, created.conversation.id, {
        clientMessageId: crypto.randomUUID(), text: "must not follow lifecycle transition",
      });
      await waitFor(async () => {
        const [row] = await inspector.client`select ${holderPid} = any(pg_blocking_pids(${contenderPid})) as blocked`;
        return row?.blocked === true;
      }, "Expected send to wait for the lifecycle user lock.");
      release!();
      await transition;
      await expect(outcome).rejects.toMatchObject({ code: "FORBIDDEN" });
      const [messageCount] = await database.db.select({ count: count() }).from(messages)
        .where(eq(messages.conversationId, created.conversation.id));
      expect(messageCount?.count).toBe(beforeMessageCount?.count);
    } finally {
      release?.();
      await database.db.delete(schema.accountLifecycles).where(eq(schema.accountLifecycles.userId, users[1]!));
      await database.db.delete(schema.conversations).where(eq(schema.conversations.id, created.conversation.id));
      await Promise.all([holder.close(), inspector.close()]);
    }
  });

  it("allocates Number.MAX_SAFE_INTEGER without changing the public sequence string", async () => {
    const created = await direct.create(users[6]!, {
      recipientId: users[7]!,
      clientMessageId: crypto.randomUUID(),
      text: "first",
    });
    await database.db.update(conversations).set({ lastMessageSequence: sql`9007199254740990::bigint` }).where(eq(conversations.id, created.conversation.id));

    const result = await send.send(users[6]!, created.conversation.id, {
      clientMessageId: crypto.randomUUID(),
      text: "maximum safe sequence",
    });

    const [stored] = await database.db.select({ sequence: sql<string>`${messages.sequence}::text` }).from(messages).where(eq(messages.id, result.message.id));
    expect(result).toMatchObject({ replayed: false, message: { sequence: "9007199254740991" } });
    expect(stored?.sequence).toBe("9007199254740991");
  });

  it("rejects Number.MAX_SAFE_INTEGER plus one and rolls back counter, message, change, and outbox work", async () => {
    const created = await direct.create(users[0]!, {
      recipientId: users[1]!,
      clientMessageId: crypto.randomUUID(),
      text: "first",
    });
    const [beforeMessageCount] = await database.db.select({ count: count() }).from(messages).where(eq(messages.conversationId, created.conversation.id));
    const [beforeChangeCount] = await database.db.select({ count: count() }).from(conversationChanges).where(eq(conversationChanges.conversationId, created.conversation.id));
    const [beforeOutboxCount] = await database.db.select({ count: count() }).from(messagingOutbox).where(eq(messagingOutbox.conversationId, created.conversation.id));
    await database.db.update(conversations).set({ lastMessageSequence: sql`9007199254740991::bigint` }).where(eq(conversations.id, created.conversation.id));

    await expect(send.send(users[0]!, created.conversation.id, {
      clientMessageId: crypto.randomUUID(),
      text: "unsafe",
    })).rejects.toThrow(RangeError);

    const [conversation] = await database.db.select({ sequence: sql<string>`${conversations.lastMessageSequence}::text` }).from(conversations).where(eq(conversations.id, created.conversation.id));
    const [messageCount] = await database.db.select({ count: count() }).from(messages).where(eq(messages.conversationId, created.conversation.id));
    const [changeCount] = await database.db.select({ count: count() }).from(conversationChanges).where(eq(conversationChanges.conversationId, created.conversation.id));
    const [outboxCount] = await database.db.select({ count: count() }).from(messagingOutbox).where(eq(messagingOutbox.conversationId, created.conversation.id));
    expect(conversation?.sequence).toBe("9007199254740991");
    expect(messageCount?.count).toBe(beforeMessageCount?.count);
    expect(changeCount?.count).toBe(beforeChangeCount?.count);
    expect(outboxCount?.count).toBe(beforeOutboxCount?.count);
  });

  it("fails closed when an existing idempotent message has an unsafe sequence", async () => {
    const clientMessageId = crypto.randomUUID();
    const created = await direct.create(users[0]!, {
      recipientId: users[5]!,
      clientMessageId,
      text: "first",
    });
    const [beforeChangeCount] = await database.db.select({ count: count() }).from(conversationChanges).where(eq(conversationChanges.conversationId, created.conversation.id));
    const [beforeOutboxCount] = await database.db.select({ count: count() }).from(messagingOutbox).where(eq(messagingOutbox.conversationId, created.conversation.id));
    await database.db.update(messages).set({ sequence: sql`9007199254740992::bigint` }).where(eq(messages.id, created.message.id));

    await expect(send.send(users[0]!, created.conversation.id, {
      clientMessageId,
      text: "first",
    })).rejects.toThrow(RangeError);

    const [conversation] = await database.db.select({ sequence: sql<string>`${conversations.lastMessageSequence}::text` }).from(conversations).where(eq(conversations.id, created.conversation.id));
    const [message] = await database.db.select({ sequence: sql<string>`${messages.sequence}::text` }).from(messages).where(eq(messages.id, created.message.id));
    const [changeCount] = await database.db.select({ count: count() }).from(conversationChanges).where(eq(conversationChanges.conversationId, created.conversation.id));
    const [outboxCount] = await database.db.select({ count: count() }).from(messagingOutbox).where(eq(messagingOutbox.conversationId, created.conversation.id));
    expect(conversation?.sequence).toBe("1");
    expect(message?.sequence).toBe("9007199254740992");
    expect(changeCount?.count).toBe(beforeChangeCount?.count);
    expect(outboxCount?.count).toBe(beforeOutboxCount?.count);
  });

  it("rejects a lifecycle-unavailable idempotent send replay without new persistence", async () => {
    const created = await direct.create(users[8]!, {
      recipientId: users[9]!, clientMessageId: crypto.randomUUID(), text: "replay after lifecycle",
    });
    const requestedAt = new Date();
    await database.db.insert(schema.accountLifecycles).values({
      userId: users[9]!, state: "pending_deletion", requestId: crypto.randomUUID(),
      idempotencyKeyDigest: "e".repeat(64), generation: 1, requestedAt,
      cancelUntil: new Date(requestedAt.getTime() + 168 * 60 * 60 * 1000),
      purgeDueAt: new Date(requestedAt.getTime() + 336 * 60 * 60 * 1000),
    });
    try {
      await expect(send.send(users[8]!, created.conversation.id, {
        clientMessageId: created.message.clientMessageId, text: "replay after lifecycle",
      })).rejects.toMatchObject({ code: "FORBIDDEN" });
      const [messageCount] = await database.db.select({ count: count() }).from(messages)
        .where(eq(messages.conversationId, created.conversation.id));
      expect(messageCount?.count).toBe(1);
    } finally {
      await database.db.delete(schema.accountLifecycles).where(eq(schema.accountLifecycles.userId, users[9]!));
    }
  });

  it("rejects pending and blocked sends without additional messages, changes, or outbox work", async () => {
    const pending = await direct.create(users[0]!, {
      recipientId: users[3]!,
      clientMessageId: crypto.randomUUID(),
      text: "pending first",
    });
    await expect(send.send(users[0]!, pending.conversation.id, {
      clientMessageId: crypto.randomUUID(),
      text: "pending second",
    })).rejects.toMatchObject({ code: "PENDING" });

    const blocked = await direct.create(users[0]!, {
      recipientId: users[4]!,
      clientMessageId: crypto.randomUUID(),
      text: "blocked first",
    });
    await database.db.insert(relationshipBlocks).values({ blockerId: users[4]!, blockedId: users[0]!, blockedAt: new Date() });
    await expect(send.send(users[0]!, blocked.conversation.id, {
      clientMessageId: crypto.randomUUID(),
      text: "blocked second",
    })).rejects.toMatchObject({ code: "BLOCKED" });

    const [pendingMessages] = await database.db.select({ count: count() }).from(messages).where(eq(messages.conversationId, pending.conversation.id));
    const [pendingChanges] = await database.db.select({ count: count() }).from(conversationChanges).where(eq(conversationChanges.conversationId, pending.conversation.id));
    const [pendingOutbox] = await database.db.select({ count: count() }).from(messagingOutbox).where(eq(messagingOutbox.conversationId, pending.conversation.id));
    const [blockedMessages] = await database.db.select({ count: count() }).from(messages).where(eq(messages.conversationId, blocked.conversation.id));
    const [blockedChanges] = await database.db.select({ count: count() }).from(conversationChanges).where(eq(conversationChanges.conversationId, blocked.conversation.id));
    const [blockedOutbox] = await database.db.select({ count: count() }).from(messagingOutbox).where(eq(messagingOutbox.conversationId, blocked.conversation.id));
    expect({ messages: pendingMessages?.count, changes: pendingChanges?.count, outbox: pendingOutbox?.count }).toEqual({ messages: 1, changes: 1, outbox: 2 });
    expect({ messages: blockedMessages?.count, changes: blockedChanges?.count, outbox: blockedOutbox?.count }).toEqual({ messages: 1, changes: 1, outbox: 2 });
  });
});
