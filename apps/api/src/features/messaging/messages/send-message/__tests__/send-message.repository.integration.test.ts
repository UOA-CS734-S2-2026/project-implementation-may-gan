import { createDayliDatabase, schema } from "@dayli/db";
import { and, asc, count, eq, inArray, or, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createLifecycleContentionFixture, deferred, lifecycleContentionEnabled } from "../../../../../../test/support/lifecycle-message-contention";
import { createMessagingPersistenceServices } from "../../../../../app";
import { createPostgresMessageWriteStore, type SendMessageStore } from "../send-message.repository";
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

suite("send message Postgres repository", () => {
  const database = createDayliDatabase(connectionString ?? "postgresql://invalid/messaging_tests");
  const contender = createDayliDatabase(connectionString ?? "postgresql://invalid/messaging_tests");
  const users = Array.from({ length: 8 }, (_, index) => `send-message-${crypto.randomUUID()}-${index}`);
  const { direct } = createMessagingPersistenceServices(database.db);
  const send = createSendMessageService({ store: createPostgresMessageWriteStore(database.db) });
  const contenderSend = createSendMessageService({ store: createPostgresMessageWriteStore(contender.db) });

  beforeAll(async () => {
    await database.db.insert(user).values(users.map((id) => ({ id, name: id, email: `${id}@example.test` })));
    await database.db.insert(friendships).values([
      { userId: users[0]!, friendId: users[1]!, state: "active", stateChangedAt: new Date() },
      { userId: users[1]!, friendId: users[0]!, state: "active", stateChangedAt: new Date() },
      { userId: users[0]!, friendId: users[4]!, state: "active", stateChangedAt: new Date() },
      { userId: users[4]!, friendId: users[0]!, state: "active", stateChangedAt: new Date() },
      { userId: users[0]!, friendId: users[5]!, state: "active", stateChangedAt: new Date() },
      { userId: users[5]!, friendId: users[0]!, state: "active", stateChangedAt: new Date() },
      { userId: users[6]!, friendId: users[7]!, state: "active", stateChangedAt: new Date() },
      { userId: users[7]!, friendId: users[6]!, state: "active", stateChangedAt: new Date() },
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

(lifecycleContentionEnabled ? describe : describe.skip)("send message lifecycle contention", () => {
  it("commits an active send before a concurrent deletion becomes pending, then rejects new writes", async () => {
    const fixture = createLifecycleContentionFixture("send-contention");
    const writer = createDayliDatabase(fixture.writerUrl);
    const reached = deferred<void>();
    const release = deferred<void>();
    const realStore = createPostgresMessageWriteStore(writer.db);
    let paused = false;
    const gatedStore: SendMessageStore = {
      withConversationTransaction: (actorId, conversationId, operation) => realStore.withConversationTransaction(actorId, conversationId, async (transaction) => {
        const realGetAccess = transaction.getAccess.bind(transaction);
        const gatedTransaction = Object.create(transaction) as typeof transaction;
        gatedTransaction.getAccess = async (requestedActorId, requestedConversationId) => {
          const access = await realGetAccess(requestedActorId, requestedConversationId);
          if (!paused) {
            expect(access).toMatchObject({ isMember: true, peerActivityBlocked: false, requestState: "active" });
            paused = true;
            reached.resolve();
            await release.promise;
          }
          return access;
        };
        return operation(gatedTransaction);
      }),
    };
    const send = createSendMessageService({ store: gatedStore });
    const users: string[] = [];
    let pendingSend: Promise<unknown> | undefined;
    let pendingDeletion: Promise<Response> | undefined;
    try {
      const alice = await fixture.signup("Alice");
      const bob = await fixture.signup("Bob");
      users.push(alice.id, bob.id);
      const { conversationId } = await fixture.seedActiveConversation(alice.id, bob.id);
      const grant = await fixture.deletionGrant(alice.token);

      pendingSend = send.send(bob.id, conversationId, { clientMessageId: crypto.randomUUID(), text: "commits before deletion" });
      await reached.promise;
      pendingDeletion = fixture.requestDeletion(alice.token, grant);
      await fixture.waitForDeletionBlockedBy(`${fixture.nonce}-writer`);

      release.resolve();
      await expect(pendingSend).resolves.toMatchObject({ replayed: false, message: { text: "commits before deletion" } });
      const deletion = await pendingDeletion!;
      expect(deletion.status).toBe(200);
      await expect(deletion.json()).resolves.toMatchObject({ state: "pending_deletion" });
      await expect(send.send(bob.id, conversationId, {
        clientMessageId: crypto.randomUUID(),
        text: "must not pass after deletion",
      })).rejects.toMatchObject({ code: "BLOCKED" });
    } finally {
      release.resolve();
      await Promise.allSettled([pendingSend, pendingDeletion].filter((value): value is Promise<unknown> => Boolean(value)));
      await writer.close();
      await fixture.close(users);
    }
  });

  it("lets an active peer withdraw only their own content through HTTP after deletion is pending", async () => {
    const fixture = createLifecycleContentionFixture("peer-retention");
    const users: string[] = [];
    try {
      const alice = await fixture.signup("Alice");
      const bob = await fixture.signup("Bob");
      users.push(alice.id, bob.id);
      const { aliceMessageId, bobMessageId, conversationId } = await fixture.seedActiveConversation(alice.id, bob.id);
      await fixture.seedReaction(aliceMessageId, alice.id, "like");
      await fixture.seedReaction(aliceMessageId, bob.id, "love");
      const deletion = await fixture.requestDeletion(alice.token, await fixture.deletionGrant(alice.token));
      expect(deletion.status).toBe(200);

      const removeOwnReaction = await fixture.app.fetch(fixture.request(`/api/v1/conversations/${conversationId}/messages/${aliceMessageId}/reaction`, {
        method: "DELETE", headers: fixture.bearer(bob.token),
      }));
      expect(removeOwnReaction.status).toBe(200);
      const unsendOwn = await fixture.app.fetch(fixture.request(`/api/v1/conversations/${conversationId}/messages/${bobMessageId}`, {
        method: "DELETE", headers: fixture.bearer(bob.token),
      }));
      expect(unsendOwn.status).toBe(200);
      const unsendAlice = await fixture.app.fetch(fixture.request(`/api/v1/conversations/${conversationId}/messages/${aliceMessageId}`, {
        method: "DELETE", headers: fixture.bearer(bob.token),
      }));
      expect(unsendAlice.status).toBe(403);
      const retained = await fixture.app.fetch(fixture.request(`/api/v1/conversations/${conversationId}/messages/${aliceMessageId}`, {
        headers: fixture.bearer(bob.token),
      }));
      expect(retained.status).toBe(200);
      await expect(retained.json()).resolves.toMatchObject({
        id: aliceMessageId,
        text: "Alice retained message",
        reactions: [{ reaction: "like", count: 1, reactedByActor: false }],
      });
    } finally {
      await fixture.close(users);
    }
  });
});
