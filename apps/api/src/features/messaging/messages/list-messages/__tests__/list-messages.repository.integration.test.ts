import { createDayliDatabase, schema } from "@dayli/db";
import { eq, inArray, or, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createMessagingPersistenceServices } from "../../../../../app";
import { createPostgresListMessagesRepository } from "../list-messages.repository";

const connectionString = process.env.MESSAGING_TEST_DATABASE_URL;
const enabled = Boolean(connectionString);
const target = connectionString ? new URL(connectionString) : undefined;
if (enabled && target?.hostname === "localhost" && target.port === "5433" && target.pathname !== "/dayli_messaging_test") {
  throw new Error("MESSAGING_TEST_DATABASE_URL must use the isolated dayli_messaging_test database.");
}
const suite = enabled ? describe : describe.skip;

suite("list messages Postgres repository", () => {
  const database = createDayliDatabase(connectionString ?? "postgresql://invalid/messaging_tests");
  const users = Array.from({ length: 4 }, (_, index) => `list-messages-${crypto.randomUUID()}-${index}`);
  const { direct, send, unsend } = createMessagingPersistenceServices(database.db);
  const repository = createPostgresListMessagesRepository(database.db);
  const builderQueries: string[] = [];
  const observedRepository = createPostgresListMessagesRepository(drizzle(database.client, {
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

  it("authorizes history pagination, keeps ordering, projects replies and reactions, and hides private conversations", async () => {
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
    await send.send(users[0]!, initial.conversation.id, { clientMessageId: crypto.randomUUID(), text: "third message" });
    const fourth = await send.send(users[1]!, initial.conversation.id, { clientMessageId: crypto.randomUUID(), text: "fourth message" });
    const now = new Date();
    await database.db.insert(schema.conversationMembers).values({
      conversationId: initial.conversation.id,
      userId: users[2]!,
      lastReadSequence: 0,
      receiptSequence: 0,
      createdAt: now,
      updatedAt: now,
    });
    await database.db.insert(schema.messageReactions).values([
      { messageId: reply.message.id, userId: users[0]!, reaction: "love", createdAt: now },
      { messageId: reply.message.id, userId: users[1]!, reaction: "love", createdAt: now },
      { messageId: reply.message.id, userId: users[2]!, reaction: "laugh", createdAt: now },
    ]);
    await database.db.update(schema.messages)
      .set({ sequence: Number.MAX_SAFE_INTEGER })
      .where(eq(schema.messages.id, fourth.message.id));

    await expect(repository.list(users[3]!, initial.conversation.id, "not-a-cursor", undefined, 2)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(repository.list(users[0]!, initial.conversation.id, undefined, "9007199254740992", 2)).rejects.toMatchObject({ code: "VALIDATION_FAILED" });

    builderQueries.length = 0;
    await expect(observedRepository.list(users[0]!, initial.conversation.id, undefined, undefined, 2)).resolves.toMatchObject({
      items: [{ sequence: "3" }, { sequence: "9007199254740991" }],
      nextCursor: "9007199254740991",
      hasMore: true,
    });
    expect(builderQueries).toHaveLength(4);
    const pageForSender = await repository.list(users[0]!, initial.conversation.id, "3", undefined, 2);
    expect(pageForSender).toMatchObject({
      items: [
        { sequence: "1" },
        {
          sequence: "2",
          replyToMessageId: initial.message.id,
          replyPreview: { id: initial.message.id, senderId: users[0], text: "parent message", unsentAt: null },
        },
      ],
      nextCursor: null,
      hasMore: false,
    });
    const reactionsForSender = pageForSender.items[1]!.reactions;
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
      { reaction: "laugh", count: 1, reactedByActor: false, reactors: [{ id: users[2]!, name: users[2]! }]},
    ]));
    await expect(repository.list(users[0]!, initial.conversation.id, undefined, "1", 2)).resolves.toMatchObject({
      items: [{ sequence: "2" }, { sequence: "3" }],
      nextCursor: "3",
      hasMore: true,
    });
    await expect(repository.list(users[0]!, initial.conversation.id, undefined, "9007199254740990", 2)).resolves.toMatchObject({
      items: [{ sequence: "9007199254740991" }],
      nextCursor: null,
      hasMore: false,
    });
    await expect(repository.list(users[1]!, initial.conversation.id, undefined, "1", 2)).resolves.toMatchObject({
      items: [{ sequence: "2", reactions: expect.arrayContaining(reactionsForSender) }, { sequence: "3" }],
    });
    const pageForThirdMember = await repository.list(users[2]!, initial.conversation.id, undefined, "1", 2);
    expect(pageForThirdMember).toMatchObject({ items: [{ sequence: "2" }, { sequence: "3" }] });
    const reactionsForThirdMember = pageForThirdMember.items[0]!.reactions;
    expect(reactionsForThirdMember).toHaveLength(2);
    expect(reactionsForThirdMember).toEqual(expect.arrayContaining([
      {
        reaction: "love",
        count: 2,
        reactedByActor: false,
        reactors: [
          { id: users[0]!, name: users[0]! },
          { id: users[1]!, name: users[1]! },
        ],
      },
      { reaction: "laugh", count: 1, reactedByActor: true, reactors: [{ id: users[2]!, name: users[2]! }] },
    ]));

    await unsend.unsend(users[0]!, initial.conversation.id, initial.message.id);
    await expect(repository.list(users[1]!, initial.conversation.id, "3", undefined, 10)).resolves.toMatchObject({
      items: [
        { sequence: "1", text: null, reactions: [] },
        {
          sequence: "2",
          text: "reply message",
          replyPreview: { id: initial.message.id, senderId: users[0], text: null, unsentAt: expect.any(String) },
          reactions: expect.arrayContaining(reactionsForSender),
        },
      ],
    });

    await unsend.unsend(users[1]!, initial.conversation.id, reply.message.id);
    await expect(repository.list(users[0]!, initial.conversation.id, "3", undefined, 10)).resolves.toMatchObject({
      items: [
        { sequence: "1", text: null, reactions: [] },
        {
          sequence: "2",
          text: null,
          replyPreview: { id: initial.message.id, senderId: users[0], text: null, unsentAt: expect.any(String) },
          reactions: [],
        },
      ],
    });
    await expect(repository.list(users[3]!, initial.conversation.id, undefined, undefined, 2)).rejects.toMatchObject({ code: "NOT_FOUND" });

    await database.db.update(schema.messages)
      .set({ sequence: sql`${Number.MAX_SAFE_INTEGER}::bigint + 2` })
      .where(eq(schema.messages.id, fourth.message.id));
    await expect(repository.list(users[0]!, initial.conversation.id, undefined, undefined, 2)).rejects.toThrow(RangeError);
    await database.db.update(schema.messages)
      .set({ sequence: 4 })
      .where(eq(schema.messages.id, fourth.message.id));
  });

  it("rejects overflowing native message versions instead of rounding list DTOs", async () => {
    const created = await direct.create(users[0]!, {
      recipientId: users[1]!,
      clientMessageId: crypto.randomUUID(),
      text: "overflowing list version",
    });
    await database.db.update(schema.messages)
      .set({ version: sql`${Number.MAX_SAFE_INTEGER}::bigint + 2` })
      .where(eq(schema.messages.id, created.message.id));

    await expect(repository.list(users[0]!, created.conversation.id, undefined, undefined, 10))
      .rejects.toThrow("Database message version must be a positive safe integer.");
  });
});
