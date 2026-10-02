import { createDayliDatabase, schema } from "@dayli/db";
import { eq, inArray, or, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createMessagingPersistenceServices } from "../../../../../app";
import { createPostgresGetMessageRepository } from "../get-message.repository";

const connectionString = process.env.MESSAGING_TEST_DATABASE_URL;
const enabled = Boolean(connectionString);
const target = connectionString ? new URL(connectionString) : undefined;
if (enabled && target?.hostname === "localhost" && target.port === "5433" && target.pathname !== "/dayli_messaging_test") {
  throw new Error("MESSAGING_TEST_DATABASE_URL must use the isolated dayli_messaging_test database.");
}
const suite = enabled ? describe : describe.skip;

suite("get message Postgres repository", () => {
  const database = createDayliDatabase(connectionString ?? "postgresql://invalid/messaging_tests");
  const users = Array.from({ length: 4 }, (_, index) => `get-message-${crypto.randomUUID()}-${index}`);
  const { direct, send, unsend } = createMessagingPersistenceServices(database.db);
  const repository = createPostgresGetMessageRepository(database.db);
  const builderQueries: string[] = [];
  const observedRepository = createPostgresGetMessageRepository(drizzle(database.client, {
    schema,
    logger: { logQuery(query) { builderQueries.push(query); } },
  }));

  beforeAll(async () => {
    const now = new Date();
    await database.db.insert(schema.user).values(users.map((id) => ({ id, name: id, email: `${id}@example.test` })));
    await database.db.insert(schema.friendships).values([
      { userId: users[0]!, friendId: users[1]!, state: "active", stateChangedAt: now },
      { userId: users[1]!, friendId: users[0]!, state: "active", stateChangedAt: now },
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

  it("keeps private NOT_FOUND behavior and projects replies and actor reactions", async () => {
    const initial = await direct.create(users[0]!, {
      recipientId: users[1]!,
      clientMessageId: crypto.randomUUID(),
      text: "parent message",
    });
    const reply = await send.send(users[1]!, initial.conversation.id, {
      clientMessageId: crypto.randomUUID(),
      text: "reply message",
      replyToMessageId: initial.message.id,
    });
    const now = new Date();
    await database.db.insert(schema.conversationMembers).values({
      conversationId: initial.conversation.id,
      userId: users[2]!,
      participantId: users[2]!,
      lastReadSequence: 0,
      receiptSequence: 0,
      createdAt: now,
      updatedAt: now,
    });
    await database.db.insert(schema.messageReactions).values([
      { messageId: reply.message.id, userId: users[0]!, participantId: users[0]!, reaction: "love", createdAt: now },
      { messageId: reply.message.id, userId: users[1]!, participantId: users[1]!, reaction: "love", createdAt: now },
      { messageId: reply.message.id, userId: users[2]!, participantId: users[2]!, reaction: "laugh", createdAt: now },
    ]);
    await database.db.update(schema.messages)
      .set({ sequence: Number.MAX_SAFE_INTEGER })
      .where(eq(schema.messages.id, reply.message.id));

    await expect(repository.get(users[3]!, initial.conversation.id, reply.message.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(repository.get(users[0]!, initial.conversation.id, crypto.randomUUID())).rejects.toMatchObject({ code: "NOT_FOUND" });

    builderQueries.length = 0;
    const messageForSender = await observedRepository.get(users[0]!, initial.conversation.id, reply.message.id);
    expect(builderQueries).toHaveLength(4);
    expect(messageForSender).toMatchObject({
      id: reply.message.id,
      sequence: "9007199254740991",
      version: 1,
      replyToMessageId: initial.message.id,
      replyPreview: { id: initial.message.id, senderId: users[0], text: "parent message", unsentAt: null },
    });
    const reactionsForSender = messageForSender.reactions;
    expect(reactionsForSender).toHaveLength(2);
    expect(reactionsForSender).toEqual(expect.arrayContaining([
      {
        reaction: "love",
        count: 2,
        reactedByActor: true,
        reactors: [
          { id: users[0]!, name: users[0]! },
          { id: users[1]!, name: users[1]! },
        ],
      },
      { reaction: "laugh", count: 1, reactedByActor: false, reactors: [{ id: users[2]!, name: users[2]! }] },
    ]));
    const messageForThirdMember = await repository.get(users[2]!, initial.conversation.id, reply.message.id);
    expect(messageForThirdMember.reactions).toHaveLength(2);
    expect(messageForThirdMember.reactions).toEqual(expect.arrayContaining([
      {
        reaction: "love",
        count: 2,
        reactedByActor: false,
        reactors: [
          { id: users[0]!, name: users[0]! },
          { id: users[1]!, name: users[1]! },
        ],
      },
      { reaction: "laugh", count: 1, reactedByActor: true, reactors: [{ id: users[2]!, name: users[2]! }]},
    ]));

    await unsend.unsend(users[0]!, initial.conversation.id, initial.message.id);
    await expect(repository.get(users[1]!, initial.conversation.id, reply.message.id)).resolves.toMatchObject({
      text: "reply message",
      replyPreview: { id: initial.message.id, senderId: users[0], text: null, unsentAt: expect.any(String) },
      reactions: expect.arrayContaining(reactionsForSender),
    });

    await unsend.unsend(users[1]!, initial.conversation.id, reply.message.id);
    await expect(repository.get(users[0]!, initial.conversation.id, reply.message.id)).resolves.toMatchObject({
      text: null,
      replyPreview: { id: initial.message.id, senderId: users[0], text: null, unsentAt: expect.any(String) },
      reactions: [],
    });
    await expect(repository.get(users[3]!, initial.conversation.id, reply.message.id)).rejects.toMatchObject({ code: "NOT_FOUND" });

    await database.db.update(schema.messages)
      .set({ sequence: sql`${Number.MAX_SAFE_INTEGER}::bigint + 2` })
      .where(eq(schema.messages.id, reply.message.id));
    await expect(repository.get(users[0]!, initial.conversation.id, reply.message.id)).rejects.toThrow(RangeError);
  });

  it("rejects overflowing native message and reply parent versions", async () => {
    const directMessage = await direct.create(users[0]!, {
      recipientId: users[1]!,
      clientMessageId: crypto.randomUUID(),
      text: "overflowing direct version",
    });
    await database.db.update(schema.messages)
      .set({ version: sql`${Number.MAX_SAFE_INTEGER}::bigint + 2` })
      .where(eq(schema.messages.id, directMessage.message.id));
    await expect(repository.get(users[0]!, directMessage.conversation.id, directMessage.message.id))
      .rejects.toThrow("Database message version must be a positive safe integer.");

    const parent = await direct.create(users[0]!, {
      recipientId: users[1]!,
      clientMessageId: crypto.randomUUID(),
      text: "overflowing reply parent version",
    });
    const reply = await send.send(users[1]!, parent.conversation.id, {
      clientMessageId: crypto.randomUUID(),
      text: "reply to overflowing parent",
      replyToMessageId: parent.message.id,
    });
    await database.db.update(schema.messages)
      .set({ version: sql`${Number.MAX_SAFE_INTEGER}::bigint + 2` })
      .where(eq(schema.messages.id, parent.message.id));
    await expect(repository.get(users[1]!, parent.conversation.id, reply.message.id))
      .rejects.toThrow("Database message version must be a positive safe integer.");
  });
});
