import { createDayliDatabase, schema } from "@dayli/db";
import { and, count, eq, inArray, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { appendPeerChange, findMessage, getAccess } from "../message-write-primitives";
import { withLockedConversationMessageTransaction } from "../conversation-message-transaction";

const {
  accountLifecycles,
  conversationChanges,
  conversationMembers,
  conversations,
  messageReactions,
  messages,
  messagingOutbox,
  messagingParticipants,
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

suite("message write primitive builders", () => {
  const database = createDayliDatabase(connectionString ?? "postgresql://invalid/messaging_tests");
  const contender = createDayliDatabase(connectionString ?? "postgresql://invalid/messaging_tests");
  const users = [
    `write-primitive-a-${crypto.randomUUID()}`,
    `write-primitive-b-${crypto.randomUUID()}`,
    `write-primitive-outsider-${crypto.randomUUID()}`,
  ];

  beforeAll(async () => {
    await database.db.insert(user).values(users.map((id) => ({ id, name: id, email: `${id}@example.test` })));
  });

  afterAll(async () => {
    try {
      await database.db.delete(user).where(inArray(user.id, users));
    } finally {
      await Promise.all([database.close(), contender.close()]);
    }
  });

  async function createConversation() {
    const conversationId = crypto.randomUUID();
    const messageId = crypto.randomUUID();
    const now = new Date("2026-09-30T00:00:00.000Z");
    await database.db.delete(conversations).where(and(eq(conversations.userLowId, users[0]!), eq(conversations.userHighId, users[1]!)));
    await database.db.insert(conversations).values({
      id: conversationId,
      kind: "direct",
      userLowId: users[0]!,
      userHighId: users[1]!,
      initiatorId: users[0]!,
      requestState: "active",
      lastMessageSequence: Number.MAX_SAFE_INTEGER,
      lastChangeSequence: Number.MAX_SAFE_INTEGER - 1,
      lastActivityAt: now,
      createdAt: now,
      updatedAt: now,
    });
    await database.db.insert(conversationMembers).values([
      { conversationId, userId: users[0]!, lastReadSequence: 0, receiptSequence: 0, createdAt: now, updatedAt: now },
      { conversationId, userId: users[1]!, lastReadSequence: 0, receiptSequence: 0, createdAt: now, updatedAt: now },
    ]);
    await database.db.insert(messages).values({
      id: messageId,
      conversationId,
      sequence: Number.MAX_SAFE_INTEGER,
      senderId: users[0]!,
      clientMessageId: crypto.randomUUID(),
      requestFingerprint: crypto.randomUUID(),
      body: "message",
      version: 1,
      createdAt: now,
    });
    await database.db.insert(messageReactions).values([
      { messageId, userId: users[0]!, reaction: "like", createdAt: now },
      { messageId, userId: users[1]!, reaction: "like", createdAt: now },
    ]);
    return { conversationId, messageId };
  }

  it("accepts maximum-safe values and rolls back rounded change sequences", async () => {
    const { conversationId, messageId } = await createConversation();

    await expect(findMessage(database.db, users[0]!, conversationId, messageId)).resolves.toMatchObject({
      sequence: BigInt(Number.MAX_SAFE_INTEGER),
      reactions: [{ reaction: "like", count: 2, reactedByActor: true }],
    });
    await expect(findMessage(database.db, users[2]!, conversationId, messageId)).resolves.toMatchObject({
      sequence: BigInt(Number.MAX_SAFE_INTEGER),
      reactions: [{ reaction: "like", count: 2, reactedByActor: false }],
    });
    await expect(getAccess(database.db, users[2]!, conversationId)).resolves.toEqual({
      conversationId,
      peerId: users[0],
      requestState: "active",
      isMember: false,
      participantsAvailable: true,
      peerActivityBlocked: false,
    });
    await expect(getAccess(database.db, users[0]!, crypto.randomUUID())).resolves.toEqual({
      conversationId: expect.any(String),
      peerId: "",
      requestState: "declined",
      isMember: false,
      participantsAvailable: false,
      peerActivityBlocked: false,
    });

    await database.db.transaction((transaction) => appendPeerChange(transaction, { conversationId, messageId, kind: "message.created" }));
    const [change] = await database.db.select({ changeSequence: conversationChanges.changeSequence }).from(conversationChanges).where(eq(conversationChanges.conversationId, conversationId));
    const outbox = await database.db.select({ changeSequence: messagingOutbox.changeSequence }).from(messagingOutbox).where(eq(messagingOutbox.conversationId, conversationId));
    expect(String(change?.changeSequence)).toBe(String(Number.MAX_SAFE_INTEGER));
    expect(outbox.map((row) => String(row.changeSequence))).toEqual([String(Number.MAX_SAFE_INTEGER), String(Number.MAX_SAFE_INTEGER)]);

    await expect(database.db.transaction((transaction) => appendPeerChange(transaction, { conversationId, messageId, kind: "message.created" }))).rejects.toThrow(RangeError);
    const [conversation] = await database.db.select({ lastChangeSequence: conversations.lastChangeSequence }).from(conversations).where(eq(conversations.id, conversationId));
    const [changeCount] = await database.db.select({ count: count() }).from(conversationChanges).where(eq(conversationChanges.conversationId, conversationId));
    const [outboxCount] = await database.db.select({ count: count() }).from(messagingOutbox).where(eq(messagingOutbox.conversationId, conversationId));
    expect(String(conversation?.lastChangeSequence)).toBe(String(Number.MAX_SAFE_INTEGER));
    expect(changeCount?.count).toBe(1);
    expect(outboxCount?.count).toBe(2);
  });

  it("fails closed when a message read has an unsafe sequence", async () => {
    const { conversationId, messageId } = await createConversation();
    await database.db.update(messages).set({ sequence: sql`9007199254740992::bigint` }).where(eq(messages.id, messageId));

    await expect(findMessage(database.db, users[0]!, conversationId, messageId)).rejects.toThrow(RangeError);
  });

  it("does not queue peer delivery after a participant becomes unavailable", async () => {
    const { conversationId, messageId } = await createConversation();
    const requestedAt = new Date();
    await database.db.insert(accountLifecycles).values({
      userId: users[1]!, state: "pending_deletion", requestId: crypto.randomUUID(),
      idempotencyKeyDigest: "f".repeat(64), generation: 1, requestedAt,
      cancelUntil: new Date(requestedAt.getTime() + 168 * 60 * 60 * 1000),
      purgeDueAt: new Date(requestedAt.getTime() + 336 * 60 * 60 * 1000),
    });
    await database.db.transaction((transaction) => appendPeerChange(transaction, {
      conversationId, messageId, kind: "message.created",
    }));
    const outbox = await database.db.select({ recipientId: messagingOutbox.recipientId })
      .from(messagingOutbox)
      .where(eq(messagingOutbox.conversationId, conversationId));
    expect(outbox.map((row) => row.recipientId)).toEqual([users[0]]);
  });

  it("rechecks mappings after a peer detaches while waiting for its canonical lock", async () => {
    const { conversationId } = await createConversation();
    const peerId = users[1]!;
    let releasePeer: (() => void) | undefined;
    let peerLocked: (() => void) | undefined;
    const locked = new Promise<void>((resolve) => { peerLocked = resolve; });
    const release = new Promise<void>((resolve) => { releasePeer = resolve; });
    const lifecycle = database.db.transaction(async (transaction) => {
      await transaction.select({ id: user.id }).from(user).where(eq(user.id, peerId)).for("update");
      peerLocked!();
      await release;
      // This models only the durable mapping transition. Current 0023 FKs
      // intentionally still retain the user row, so this is not a deletion test.
      await transaction.update(messagingParticipants)
        .set({ userId: null, state: "deleted" })
        .where(eq(messagingParticipants.userId, peerId));
    });
    await locked;
    let callbackRan = false;
    const write = contender.db.transaction(async (transaction) =>
      withLockedConversationMessageTransaction(transaction, conversationId, async (lockedTransaction) => {
        callbackRan = true;
        await expect(getAccess(lockedTransaction, users[0]!, conversationId)).resolves.toMatchObject({
          isMember: true,
          participantsAvailable: false,
          peerActivityBlocked: false,
        });
      }));
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(callbackRan).toBe(false);
    releasePeer!();
    await Promise.all([lifecycle, write]);

    await database.db.insert(relationshipBlocks).values({ blockerId: users[0]!, blockedId: peerId, blockedAt: new Date() });
    await expect(getAccess(database.db, users[0]!, conversationId)).resolves.toMatchObject({
      participantsAvailable: false,
      peerActivityBlocked: false,
    });
    await database.db.delete(relationshipBlocks).where(and(
      eq(relationshipBlocks.blockerId, users[0]!),
      eq(relationshipBlocks.blockedId, peerId),
    ));
    await database.db.update(messagingParticipants)
      .set({ userId: peerId, state: "active" })
      .where(eq(messagingParticipants.id, peerId));
  });

  it("serializes concurrent access through the conversation row lock", async () => {
    const { conversationId } = await createConversation();
    let notifyFirstLocked: (() => void) | undefined;
    let releaseFirstLock: (() => void) | undefined;
    const firstLocked = new Promise<void>((resolve) => { notifyFirstLocked = resolve; });
    const release = new Promise<void>((resolve) => { releaseFirstLock = resolve; });
    const first = database.db.transaction(async (transaction) => {
      await getAccess(transaction, users[0]!, conversationId);
      notifyFirstLocked!();
      await release;
    });
    await firstLocked;

    let contenderFinished = false;
    const second = contender.db.transaction(async (transaction) => {
      await getAccess(transaction, users[1]!, conversationId);
      contenderFinished = true;
    });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(contenderFinished).toBe(false);
    releaseFirstLock!();
    await Promise.all([first, second]);
    expect(contenderFinished).toBe(true);
  });
});
