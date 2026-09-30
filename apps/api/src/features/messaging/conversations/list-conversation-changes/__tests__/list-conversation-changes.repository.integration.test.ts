import { createDayliDatabase, schema, sql } from "@dayli/db";
import { eq, inArray, or } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createMessagingPersistenceServices } from "../../../../../app";
import { createPostgresListConversationChangesRepository } from "../list-conversation-changes.repository";

const connectionString = process.env.MESSAGING_TEST_DATABASE_URL;
const enabled = Boolean(connectionString);
const target = connectionString ? new URL(connectionString) : undefined;
if (enabled && target?.hostname === "localhost" && target.port === "5433" && target.pathname !== "/dayli_messaging_test") {
  throw new Error("MESSAGING_TEST_DATABASE_URL must use the isolated dayli_messaging_test database.");
}
const suite = enabled ? describe : describe.skip;

suite("list conversation changes Postgres repository", () => {
  const database = createDayliDatabase(connectionString ?? "postgresql://invalid/messaging_tests");
  const users = Array.from({ length: 3 }, (_, index) => `list-conversation-changes-${crypto.randomUUID()}-${index}`);
  const { direct, markConversationRead, send } = createMessagingPersistenceServices(database.db);
  const repository = createPostgresListConversationChangesRepository(database.db);

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

  it("keeps membership private and returns ordered, strictly paginated near-safe changes after blocks", async () => {
    const first = await direct.create(users[0]!, {
      recipientId: users[1]!,
      clientMessageId: crypto.randomUUID(),
      text: "first message",
    });
    const second = await send.send(users[1]!, first.conversation.id, {
      clientMessageId: crypto.randomUUID(),
      text: "second message",
    });
    const third = await send.send(users[1]!, first.conversation.id, {
      clientMessageId: crypto.randomUUID(),
      text: "third message",
    });
    await markConversationRead.markRead(users[0]!, first.conversation.id, "3");

    const sequenceOffset = "9007199254740987";
    const firstSequence = "9007199254740988";
    const secondSequence = "9007199254740989";
    const thirdSequence = "9007199254740990";
    const fourthSequence = "9007199254740991";
    await database.db.update(schema.conversationChanges)
      .set({ changeSequence: sql`${schema.conversationChanges.changeSequence} + ${Number(sequenceOffset)}` })
      .where(eq(schema.conversationChanges.conversationId, first.conversation.id));
    await database.db.update(schema.conversations)
      .set({ lastChangeSequence: sql`${schema.conversations.lastChangeSequence} + ${Number(sequenceOffset)}` })
      .where(eq(schema.conversations.id, first.conversation.id));

    await expect(repository.list(users[2]!, first.conversation.id, "9007199254740992", 2)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(repository.list(users[0]!, first.conversation.id, "9007199254740992", 2))
      .rejects.toMatchObject({ code: "VALIDATION_FAILED" });

    await database.db.insert(schema.relationshipBlocks).values({
      blockerId: users[1]!,
      blockedId: users[0]!,
      blockedAt: new Date(),
    });

    await expect(repository.list(users[0]!, first.conversation.id, undefined, 2)).resolves.toEqual({
      items: [
        {
          changeSequence: firstSequence,
          kind: "message.created",
          messageId: first.message.id,
          memberId: null,
          createdAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
        },
        {
          changeSequence: secondSequence,
          kind: "message.created",
          messageId: second.message.id,
          memberId: null,
          createdAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
        },
      ],
      nextChangeSequence: secondSequence,
      hasMore: true,
      highWatermark: fourthSequence,
    });

    await expect(repository.list(users[0]!, first.conversation.id, firstSequence, 2)).resolves.toEqual({
      items: [
        {
          changeSequence: secondSequence,
          kind: "message.created",
          messageId: second.message.id,
          memberId: null,
          createdAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
        },
        {
          changeSequence: thirdSequence,
          kind: "message.created",
          messageId: third.message.id,
          memberId: null,
          createdAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
        },
      ],
      nextChangeSequence: thirdSequence,
      hasMore: true,
      highWatermark: fourthSequence,
    });

    await expect(repository.list(users[0]!, first.conversation.id, thirdSequence, 2)).resolves.toEqual({
      items: [
        {
          changeSequence: fourthSequence,
          kind: "read.updated",
          messageId: null,
          memberId: users[0],
          createdAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
        },
      ],
      nextChangeSequence: null,
      hasMore: false,
      highWatermark: fourthSequence,
    });
  });

  it("rejects overflowing native change sequences and high watermarks", async () => {
    const created = await direct.create(users[0]!, {
      recipientId: users[2]!,
      clientMessageId: crypto.randomUUID(),
      text: "overflowing change sequence",
    });

    // Drizzle's bigint number mode cannot represent values above MAX_SAFE_INTEGER exactly.
    await database.db.update(schema.conversationChanges).set({ changeSequence: sql`9007199254740993::bigint` })
      .where(eq(schema.conversationChanges.conversationId, created.conversation.id));
    await expect(repository.list(users[0]!, created.conversation.id, "9007199254740991", 1))
      .rejects.toThrow("Database sequence must be a safe nonnegative integer.");

    await database.db.update(schema.conversationChanges).set({ changeSequence: 1 })
      .where(eq(schema.conversationChanges.conversationId, created.conversation.id));
    // Drizzle's bigint number mode cannot represent values above MAX_SAFE_INTEGER exactly.
    await database.db.update(schema.conversations).set({ lastChangeSequence: sql`9007199254740993::bigint` })
      .where(eq(schema.conversations.id, created.conversation.id));
    await expect(repository.list(users[0]!, created.conversation.id, undefined, 1))
      .rejects.toThrow("Database sequence must be a safe nonnegative integer.");
  });
});
