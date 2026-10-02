import { createDayliDatabase, schema, sql } from "@dayli/db";
import { and, eq, inArray, or } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createMessagingPersistenceServices } from "../../../../../app";
import { createPostgresListConversationsRepository } from "../list-conversations.repository";

const connectionString = process.env.MESSAGING_TEST_DATABASE_URL;
const enabled = Boolean(connectionString);
const target = connectionString ? new URL(connectionString) : undefined;
if (enabled && target?.hostname === "localhost" && target.port === "5433" && target.pathname !== "/dayli_messaging_test") {
  throw new Error("MESSAGING_TEST_DATABASE_URL must use the isolated dayli_messaging_test database.");
}
const suite = enabled ? describe : describe.skip;

suite("list conversations Postgres repository", () => {
  const database = createDayliDatabase(connectionString ?? "postgresql://invalid/messaging_tests");
  const users = Array.from({ length: 10 }, (_, index) => `list-conversations-${crypto.randomUUID()}-${index}`);
  const {
    direct, edit, findDirectConversation, getConversation, getMessagingUnread,
    listMessages, markConversationRead, resolveMessageRequest, send, unsend,
  } = createMessagingPersistenceServices(database.db);
  const repository = createPostgresListConversationsRepository(database.db);
  const builderQueries: string[] = [];
  const observedRepository = createPostgresListConversationsRepository(drizzle(database.client, {
    schema,
    logger: { logQuery(query) { builderQueries.push(query); } },
  }));

  beforeAll(async () => {
    await database.db.insert(schema.user).values(users.map((id) => ({ id, name: id, email: `${id}@example.test` })));
    await database.db.insert(schema.friendships).values([
      { userId: users[0]!, friendId: users[1]!, state: "active", stateChangedAt: new Date() },
      { userId: users[1]!, friendId: users[0]!, state: "active", stateChangedAt: new Date() },
      { userId: users[0]!, friendId: users[2]!, state: "active", stateChangedAt: new Date() },
      { userId: users[2]!, friendId: users[0]!, state: "active", stateChangedAt: new Date() },
      { userId: users[0]!, friendId: users[6]!, state: "active", stateChangedAt: new Date() },
      { userId: users[6]!, friendId: users[0]!, state: "active", stateChangedAt: new Date() },
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

  it("keeps membership, folders, blocks, precise cursors, pages, unread states, and latest-message DTOs", async () => {
    const activeWithUnread = await direct.create(users[0]!, {
      recipientId: users[1]!,
      clientMessageId: crypto.randomUUID(),
      text: "first active message",
    });
    const reply = await send.send(users[1]!, activeWithUnread.conversation.id, {
      clientMessageId: crypto.randomUUID(),
      text: "latest active message",
    });
    const activeWithoutUnread = await direct.create(users[0]!, {
      recipientId: users[2]!,
      clientMessageId: crypto.randomUUID(),
      text: "second active message",
    });
    const activeWithSameActivity = await direct.create(users[0]!, {
      recipientId: users[6]!,
      clientMessageId: crypto.randomUUID(),
      text: "same activity message",
    });
    const incomingRequest = await direct.create(users[3]!, {
      recipientId: users[0]!,
      clientMessageId: crypto.randomUUID(),
      text: "incoming request",
    });
    await direct.create(users[0]!, {
      recipientId: users[4]!,
      clientMessageId: crypto.randomUUID(),
      text: "outgoing request",
    });

    const sequence = "9007199254740991";
    const lastReadSequence = "9007199254740990";
    await database.db.update(schema.messages).set({ sequence: Number(sequence) }).where(eq(schema.messages.id, reply.message.id));
    await database.db.update(schema.conversations).set({ lastMessageSequence: Number(sequence) })
      .where(eq(schema.conversations.id, activeWithUnread.conversation.id));
    await database.db.update(schema.conversationMembers).set({
      lastReadSequence: Number(lastReadSequence),
      receiptSequence: Number(lastReadSequence),
    }).where(and(
      eq(schema.conversationMembers.conversationId, activeWithUnread.conversation.id),
      eq(schema.conversationMembers.userId, users[0]!),
    ));
    // JavaScript Date cannot retain the cursor's microsecond precision.
    await database.db.update(schema.conversations).set({ lastActivityAt: sql`'2026-09-28T06:00:00.000001Z'::timestamptz` })
      .where(eq(schema.conversations.id, activeWithUnread.conversation.id));
    // JavaScript Date cannot retain the cursor's microsecond precision.
    await database.db.update(schema.conversations).set({ lastActivityAt: sql`'2026-09-28T06:00:00.000002Z'::timestamptz` })
      .where(or(
        eq(schema.conversations.id, activeWithoutUnread.conversation.id),
        eq(schema.conversations.id, activeWithSameActivity.conversation.id),
      ));

    const tiedIds = [activeWithoutUnread.conversation.id, activeWithSameActivity.conversation.id].sort().reverse();
    builderQueries.length = 0;
    const first = await observedRepository.list(users[0]!, "inbox", undefined, 1);
    expect(builderQueries).toHaveLength(2);
    const listQuery = builderQueries[0]!;
    expect(listQuery).toContain("left join lateral");
    expect(listQuery).toContain("to_char");
    expect(listQuery).not.toContain('::text');
    expect(listQuery).not.toContain('::bigint');
    expect(listQuery).toMatch(/^select /);
    expect(listQuery).toContain('select count(*) as "count" from "messages"');
    expect(listQuery).toContain('"messages"."conversation_id" = "conversations"."id"');
    expect(listQuery).toContain('"messages"."sender_participant_id" <>');
    expect(listQuery).toContain('"messages"."sequence" > "conversation_members"."last_read_sequence"');
    expect(listQuery).toContain('"messages"."unsent_at" is null');
    expect(listQuery.match(/select count\(\*\) as "count" from "messages"/g)).toHaveLength(1);
    expect(builderQueries.filter((query) => query.includes('select count(*)'))).toEqual([listQuery]);
    builderQueries.length = 0;
    const second = await observedRepository.list(users[0]!, "inbox", first.nextCursor ?? undefined, 1);
    expect(builderQueries).toHaveLength(2);
    expect(builderQueries[0]).toContain('("conversations"."last_activity_at", "conversations"."id") < ($');
    const third = await repository.list(users[0]!, "inbox", second.nextCursor ?? undefined, 1);
    const [firstCursorActivity, firstCursorId] = JSON.parse(atob(first.nextCursor!)) as [string, string];
    const [secondCursorActivity, secondCursorId] = JSON.parse(atob(second.nextCursor!)) as [string, string];

    expect([firstCursorActivity, firstCursorId]).toEqual(["2026-09-28T06:00:00.000002+00", tiedIds[0]!]);
    expect([secondCursorActivity, secondCursorId]).toEqual(["2026-09-28T06:00:00.000002+00", tiedIds[1]!]);
    expect(first.items).toMatchObject([{ id: tiedIds[0] }]);
    expect(second.items).toMatchObject([{ id: tiedIds[1] }]);
    expect(third.items).toMatchObject([{ id: activeWithUnread.conversation.id }]);
    expect(third.nextCursor).toBeNull();

    const inbox = await repository.list(users[0]!, "inbox", undefined, 10);
    expect(inbox.items).toHaveLength(3);
    expect(inbox.items).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: activeWithUnread.conversation.id,
        peer: { id: users[1], name: null },
        requestState: "active",
        latestMessage: expect.objectContaining({
          id: reply.message.id,
          sequence,
          version: 1,
          senderId: users[1],
          text: "latest active message",
        }),
        unreadCount: 1,
        lastMessageSequence: sequence,
        lastReadSequence,
        receiptSequence: lastReadSequence,
        capabilities: { canSend: true, canResolveRequest: false },
      }),
    ]));
    const activeInboxItem = inbox.items.find(
      (item) => (item as { id?: string }).id === activeWithUnread.conversation.id,
    ) as { unreadCount?: unknown } | undefined;
    expect(activeInboxItem?.unreadCount).toBe(1);
    expect(typeof activeInboxItem?.unreadCount).toBe("number");

    await expect(repository.list(users[0]!, "requests", undefined, 10)).resolves.toMatchObject({
      items: [expect.objectContaining({
        id: incomingRequest.conversation.id,
        peer: { id: users[3], name: null },
        requestState: "pending",
        latestMessage: expect.objectContaining({ text: "incoming request", senderId: users[3] }),
        unreadCount: 1,
        capabilities: { canSend: false, canResolveRequest: true },
      })],
      nextCursor: null,
    });
    await expect(repository.list(users[7]!, "inbox", undefined, 10)).resolves.toEqual({ items: [], nextCursor: null });
    await expect(repository.list(users[7]!, "requests", undefined, 10)).resolves.toEqual({ items: [], nextCursor: null });

    await database.db.insert(schema.messageReactions).values([
      { messageId: reply.message.id, userId: users[0]!, participantId: users[0]!, reaction: "love", createdAt: new Date() },
      { messageId: reply.message.id, userId: users[1]!, participantId: users[1]!, reaction: "love", createdAt: new Date() },
    ]);
    await expect(repository.list(users[0]!, "inbox", undefined, 10)).resolves.toMatchObject({
      items: expect.arrayContaining([expect.objectContaining({
        id: activeWithUnread.conversation.id,
        latestMessage: expect.objectContaining({
          version: 1,
          reactions: [{
            reaction: "love",
            count: 2,
            reactedByActor: true,
            reactors: [
              { id: users[0]!, name: users[0]! },
              { id: users[1]!, name: users[1]! },
            ],
          }],
        }),
      })]),
    });
    await unsend.unsend(users[1]!, activeWithUnread.conversation.id, reply.message.id);
    await expect(repository.list(users[0]!, "inbox", undefined, 10)).resolves.toMatchObject({
      items: expect.arrayContaining([expect.objectContaining({
        id: activeWithUnread.conversation.id,
        unreadCount: 0,
        latestMessage: expect.objectContaining({ text: null, unsentAt: expect.any(String), reactions: [] }),
      })]),
    });
    const readReply = await send.send(users[2]!, activeWithoutUnread.conversation.id, {
      clientMessageId: crypto.randomUUID(),
      text: "read active message",
    });
    await expect(repository.list(users[0]!, "inbox", undefined, 10)).resolves.toMatchObject({
      items: expect.arrayContaining([expect.objectContaining({
        id: activeWithoutUnread.conversation.id,
        unreadCount: 1,
      })]),
    });
    await database.db.update(schema.conversationMembers).set({ lastReadSequence: Number(readReply.message.sequence) })
      .where(and(
        eq(schema.conversationMembers.conversationId, activeWithoutUnread.conversation.id),
        eq(schema.conversationMembers.userId, users[0]!),
      ));
    await expect(repository.list(users[0]!, "inbox", undefined, 10)).resolves.toMatchObject({
      items: expect.arrayContaining([expect.objectContaining({
        id: activeWithoutUnread.conversation.id,
        unreadCount: 0,
      })]),
    });
    const blank = await direct.create(users[5]!, {
      recipientId: users[0]!,
      clientMessageId: crypto.randomUUID(),
      text: "blank latest message",
    });
    await database.db.delete(schema.messages).where(eq(schema.messages.id, blank.message.id));
    await database.db.update(schema.conversations).set({ lastMessageSequence: 0, lastChangeSequence: 0 })
      .where(eq(schema.conversations.id, blank.conversation.id));
    await expect(repository.list(users[0]!, "requests", undefined, 10)).resolves.toMatchObject({
      items: expect.arrayContaining([expect.objectContaining({ id: blank.conversation.id, latestMessage: null })]),
    });

    await database.db.insert(schema.relationshipBlocks).values({
      blockerId: users[0]!,
      blockedId: users[1]!,
      blockedAt: new Date(),
    });
    await expect(repository.list(users[0]!, "inbox", undefined, 10)).resolves.toEqual(expect.objectContaining({
      items: expect.arrayContaining([expect.objectContaining({
        id: activeWithUnread.conversation.id,
        capabilities: { canSend: false, canResolveRequest: false },
      })]),
    }));
  });

  it("reads custom participant IDs through folders, history, unread counts, reactions, and membership", async () => {
    const actor = users[8]!;
    const peer = users[9]!;
    // 0023 requires participant ordering to match the legacy canonical pair.
    const actorParticipant = `${actor < peer ? "a" : "z"}-participant-${crypto.randomUUID()}`;
    const peerParticipant = `${actor < peer ? "z" : "a"}-participant-${crypto.randomUUID()}`;
    const requestRecipient = users[7]!;
    const requestRecipientParticipant = peer < requestRecipient
      ? `${peerParticipant}z`
      : `0-participant-${crypto.randomUUID()}`;
    await database.db.update(schema.messagingParticipants).set({ id: actorParticipant })
      .where(eq(schema.messagingParticipants.userId, actor));
    await database.db.update(schema.messagingParticipants).set({ id: peerParticipant })
      .where(eq(schema.messagingParticipants.userId, peer));
    await database.db.update(schema.messagingParticipants).set({ id: requestRecipientParticipant })
      .where(eq(schema.messagingParticipants.userId, requestRecipient));
    await database.db.insert(schema.friendships).values([
      { userId: actor, friendId: peer, state: "active", stateChangedAt: new Date() },
      { userId: peer, friendId: actor, state: "active", stateChangedAt: new Date() },
    ]);

    // These calls deliberately retain the deployed user-ID writer shape. The
    // 0023 trigger derives the mismatched durable IDs used by all reads below.
    const created = await direct.create(actor, {
      recipientId: peer,
      clientMessageId: crypto.randomUUID(),
      text: "participant canary",
    });
    expect(created.conversation.peerId).toBe(peerParticipant);
    expect(created.message.senderId).toBe(actorParticipant);
    await expect(direct.create(actor, {
      recipientId: peer,
      clientMessageId: created.message.clientMessageId,
      text: "participant canary",
    })).resolves.toMatchObject({
      replayed: true,
      conversation: { id: created.conversation.id, peerId: peerParticipant },
    });
    await expect(edit.edit(actor, created.conversation.id, created.message.id, {
      text: "edited participant canary",
      expectedVersion: 1,
    })).resolves.toMatchObject({ senderId: actorParticipant, text: "edited participant canary", version: 2 });
    await expect(unsend.unsend(actor, created.conversation.id, created.message.id))
      .resolves.toMatchObject({ replayed: false, message: { senderId: actorParticipant, text: null } });
    const reply = await send.send(peer, created.conversation.id, {
      clientMessageId: crypto.randomUUID(),
      text: "old worker participant reply",
    });
    await database.db.insert(schema.messageReactions).values([
      { messageId: reply.message.id, userId: actor, participantId: actorParticipant, reaction: "angry", createdAt: new Date() },
      { messageId: reply.message.id, userId: peer, participantId: peerParticipant, reaction: "angry", createdAt: new Date() },
    ]);

    const list = await repository.list(actor, "inbox", undefined, 10);
    expect(list.items).toEqual(expect.arrayContaining([expect.objectContaining({
      id: created.conversation.id,
      peer: { id: peerParticipant, name: null },
      unreadCount: 1,
      latestMessage: expect.objectContaining({
        senderId: peerParticipant,
        reactions: [expect.objectContaining({
          reaction: "angry",
          count: 2,
          reactedByActor: true,
          reactors: expect.arrayContaining([
            { id: actorParticipant, name: actor },
            { id: peerParticipant, name: peer },
          ]),
        })],
      }),
    })]));
    await expect(findDirectConversation.find(actor, peer))
      .resolves.toEqual({ conversationId: created.conversation.id });
    await expect(getConversation.get(actor, created.conversation.id))
      .resolves.toMatchObject({ peer: { id: peerParticipant }, unreadCount: 1 });
    await expect(getMessagingUnread.get(actor)).resolves.toEqual({ inboxCount: 1, requestCount: 0 });
    await expect(listMessages.list(actor, created.conversation.id, undefined, undefined, 10))
      .resolves.toMatchObject({ items: [
        expect.objectContaining({ senderId: actorParticipant, text: null }),
        expect.objectContaining({ senderId: peerParticipant, text: "old worker participant reply" }),
      ] });
    await expect(markConversationRead.markRead(actor, created.conversation.id, reply.message.sequence))
      .resolves.toMatchObject({ lastReadSequence: reply.message.sequence, unreadCount: 0 });

    const pending = await direct.create(peer, {
      recipientId: requestRecipient,
      clientMessageId: crypto.randomUUID(),
      text: "participant request",
    });
    expect(pending.conversation.peerId).toBe(requestRecipientParticipant);
    await expect(resolveMessageRequest.resolve(requestRecipient, pending.conversation.id, "accept"))
      .resolves.toMatchObject({ peer: { id: peerParticipant }, requestState: "active" });

    await database.db.insert(schema.relationshipBlocks).values({ blockerId: actor, blockedId: peer, blockedAt: new Date() });
    // A block prevents new peer activity but retains both participants' history.
    await expect(listMessages.list(actor, created.conversation.id, undefined, undefined, 10))
      .resolves.toMatchObject({ items: expect.arrayContaining([expect.objectContaining({ senderId: actorParticipant })]) });
    await expect(getConversation.get(users[6]!, created.conversation.id))
      .rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("fails closed for overflowing native conversation and latest-message values", async () => {
    const created = await direct.create(users[0]!, {
      recipientId: users[2]!,
      clientMessageId: crypto.randomUUID(),
      text: "overflowing conversation latest values",
    });

    // Drizzle's bigint number mode cannot represent values above MAX_SAFE_INTEGER exactly.
    await database.db.update(schema.messages).set({ sequence: sql`9007199254740993::bigint` })
      .where(eq(schema.messages.id, created.message.id));
    await expect(repository.list(users[0]!, "inbox", undefined, 10))
      .rejects.toThrow("Database sequence must be a safe nonnegative integer.");
    await database.db.update(schema.messages).set({ sequence: Number(created.message.sequence) })
      .where(eq(schema.messages.id, created.message.id));
    // Drizzle's bigint number mode cannot represent values above MAX_SAFE_INTEGER exactly.
    await database.db.update(schema.conversations).set({ lastMessageSequence: sql`9007199254740993::bigint` })
      .where(eq(schema.conversations.id, created.conversation.id));
    await expect(repository.list(users[0]!, "inbox", undefined, 10))
      .rejects.toThrow("Database sequence must be a safe nonnegative integer.");
    // This mixed safe and overflowing bigint update needs exact native PostgreSQL literals.
    await database.db.update(schema.conversations).set({
      lastMessageSequence: sql`${created.message.sequence}::bigint`,
      lastChangeSequence: sql`9007199254740993::bigint`,
    }).where(eq(schema.conversations.id, created.conversation.id));
    await expect(repository.list(users[0]!, "inbox", undefined, 10))
      .rejects.toThrow("Database sequence must be a safe nonnegative integer.");
    await database.db.update(schema.conversations).set({ lastChangeSequence: 0 })
      .where(eq(schema.conversations.id, created.conversation.id));
    // Drizzle's bigint number mode cannot represent values above MAX_SAFE_INTEGER exactly.
    await database.db.update(schema.conversationMembers).set({ lastReadSequence: sql`9007199254740993::bigint` })
      .where(and(
        eq(schema.conversationMembers.conversationId, created.conversation.id),
        eq(schema.conversationMembers.userId, users[0]!),
      ));
    await expect(repository.list(users[0]!, "inbox", undefined, 10))
      .rejects.toThrow("Database sequence must be a safe nonnegative integer.");
    await database.db.update(schema.conversationMembers).set({ lastReadSequence: 0 })
      .where(and(
        eq(schema.conversationMembers.conversationId, created.conversation.id),
        eq(schema.conversationMembers.userId, users[0]!),
      ));
    // Drizzle's bigint number mode cannot represent values above MAX_SAFE_INTEGER exactly.
    await database.db.update(schema.messages).set({ version: sql`9007199254740993::bigint` })
      .where(eq(schema.messages.id, created.message.id));
    await expect(repository.list(users[0]!, "inbox", undefined, 10))
      .rejects.toThrow("Database message version must be a positive safe integer.");
  });

  it("masks a pending-deletion peer in the conversation list", async () => {
    const [conversation] = await database.db.select({ id: schema.conversations.id })
      .from(schema.conversations)
      .where(or(
        and(eq(schema.conversations.userLowId, users[0]!), eq(schema.conversations.userHighId, users[2]!)),
        and(eq(schema.conversations.userLowId, users[2]!), eq(schema.conversations.userHighId, users[0]!)),
      ))
      .limit(1);
    if (!conversation) throw new Error("Expected a conversation for lifecycle peer projection.");
    await database.db.update(schema.messages).set({ version: 1 })
      .where(eq(schema.messages.conversationId, conversation.id));
    await database.db.update(schema.user).set({
      name: "private peer name",
      username: "privatepeer",
      displayUsername: "private peer display name",
      image: "https://example.test/private-peer-avatar.png",
    }).where(eq(schema.user.id, users[2]!));
    const requestedAt = new Date();
    await database.db.insert(schema.accountLifecycles).values({
      userId: users[2]!,
      state: "pending_deletion",
      requestId: crypto.randomUUID(),
      idempotencyKeyDigest: "b".repeat(64),
      generation: 1,
      requestedAt,
      cancelUntil: new Date(requestedAt.getTime() + 168 * 60 * 60 * 1000),
      purgeDueAt: new Date(requestedAt.getTime() + 336 * 60 * 60 * 1000),
    });

    await expect(repository.list(users[0]!, "inbox", undefined, 10)).resolves.toMatchObject({
      items: expect.arrayContaining([
        expect.objectContaining({
          id: conversation.id,
          peer: { id: users[2], name: "Deleted account" },
        }),
      ]),
    });
  });
});
