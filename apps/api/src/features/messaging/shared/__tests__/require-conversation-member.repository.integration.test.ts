import { createDayliDatabase, schema, sql } from "@dayli/db";
import { and, eq, inArray, or } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createMessagingPersistenceServices } from "../../../../app";
import { requireConversationMember } from "../require-conversation-member";

const connectionString = process.env.MESSAGING_TEST_DATABASE_URL;
const enabled = Boolean(connectionString);
const target = connectionString ? new URL(connectionString) : undefined;
if (enabled && target?.hostname === "localhost" && target.port === "5433" && target.pathname !== "/dayli_messaging_test") {
  throw new Error("MESSAGING_TEST_DATABASE_URL must use the isolated dayli_messaging_test database.");
}
const suite = enabled ? describe : describe.skip;

suite("require conversation member Postgres query", () => {
  const database = createDayliDatabase(connectionString ?? "postgresql://invalid/messaging_tests");
  const concurrentDatabase = createDayliDatabase(connectionString ?? "postgresql://invalid/messaging_tests");
  const users = Array.from({ length: 3 }, (_, index) => `require-conversation-member-${crypto.randomUUID()}-${index}`);
  const { direct } = createMessagingPersistenceServices(database.db);

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
      await concurrentDatabase.close();
      await database.close();
    }
  });

  it("keeps a nonmember conversation lookup indistinguishable from an absent conversation", async () => {
    const conversation = await direct.create(users[0]!, {
      recipientId: users[1]!,
      clientMessageId: crypto.randomUUID(),
      text: "private",
    });

    await expect(requireConversationMember(database.db, users[2]!, conversation.conversation.id))
      .rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(requireConversationMember(database.db, users[2]!, crypto.randomUUID()))
      .rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("preserves safe native bigint state and locks both conversation and actor member rows", async () => {
    const conversation = await direct.create(users[0]!, {
      recipientId: users[1]!,
      clientMessageId: crypto.randomUUID(),
      text: "locked",
    });
    const memberId = users[1]!;
    const memberSequence = Number.MAX_SAFE_INTEGER;
    await database.db.update(schema.conversations)
      .set({ lastMessageSequence: memberSequence, lastChangeSequence: memberSequence })
      .where(eq(schema.conversations.id, conversation.conversation.id));
    await database.db.update(schema.conversationMembers)
      .set({ lastReadSequence: memberSequence, receiptSequence: memberSequence })
      .where(and(
        eq(schema.conversationMembers.conversationId, conversation.conversation.id),
        eq(schema.conversationMembers.userId, memberId),
      ));

    let releaseLock: (() => void) | undefined;
    let signalLocked: (() => void) | undefined;
    const locked = new Promise<void>((resolve) => { signalLocked = resolve; });
    const release = new Promise<void>((resolve) => { releaseLock = resolve; });
    const holder = database.db.transaction(async (tx) => {
      const member = await requireConversationMember(tx, memberId, conversation.conversation.id, true);
      expect(member).toMatchObject({
        last_message_sequence: memberSequence,
        last_change_sequence: memberSequence,
        last_read_sequence: memberSequence,
        receipt_sequence: memberSequence,
      });
      signalLocked!();
      await release;
    });

    await locked;
    try {
      await expect(concurrentDatabase.db.transaction(async (tx) => {
        await tx.execute(sql`set local lock_timeout = '100ms'`);
        await tx.update(schema.conversationMembers)
          .set({ lastReadSequence: sql`${schema.conversationMembers.lastReadSequence}` })
          .where(and(
            eq(schema.conversationMembers.conversationId, conversation.conversation.id),
            eq(schema.conversationMembers.userId, memberId),
          ));
      })).rejects.toMatchObject({ cause: { code: "55P03" } });
      await expect(concurrentDatabase.db.transaction(async (tx) => {
        await tx.execute(sql`set local lock_timeout = '100ms'`);
        await tx.update(schema.conversations)
          .set({ updatedAt: sql`${schema.conversations.updatedAt}` })
          .where(eq(schema.conversations.id, conversation.conversation.id));
      })).rejects.toMatchObject({ cause: { code: "55P03" } });
    } finally {
      releaseLock!();
      await holder;
    }
  });

  it("fails closed for every overflowing sequence column within a locked transaction", async () => {
    const conversation = await direct.create(users[0]!, {
      recipientId: users[2]!,
      clientMessageId: crypto.randomUUID(),
      text: "overflow",
    });
    const memberId = users[2]!;
    const memberWhere = and(
      eq(schema.conversationMembers.conversationId, conversation.conversation.id),
      eq(schema.conversationMembers.userId, memberId),
    );
    await database.db.update(schema.conversations)
      .set({ lastMessageSequence: 1, lastChangeSequence: 1 })
      .where(eq(schema.conversations.id, conversation.conversation.id));
    await database.db.update(schema.conversationMembers)
      .set({ lastReadSequence: 0, receiptSequence: 0 })
      .where(memberWhere);
    const expectOverflowToFail = async () => {
      await expect(database.db.transaction((tx) => requireConversationMember(
        tx,
        memberId,
        conversation.conversation.id,
        true,
      ))).rejects.toThrow("Database sequence must be a safe nonnegative integer.");
    };

    await database.db.update(schema.conversations)
      .set({ lastMessageSequence: sql`9007199254740993::bigint` })
      .where(eq(schema.conversations.id, conversation.conversation.id));
    await expectOverflowToFail();
    await database.db.update(schema.conversations)
      .set({ lastMessageSequence: 1 })
      .where(eq(schema.conversations.id, conversation.conversation.id));

    await database.db.update(schema.conversations)
      .set({ lastChangeSequence: sql`9007199254740993::bigint` })
      .where(eq(schema.conversations.id, conversation.conversation.id));
    await expectOverflowToFail();
    await database.db.update(schema.conversations)
      .set({ lastChangeSequence: 1 })
      .where(eq(schema.conversations.id, conversation.conversation.id));

    await database.db.update(schema.conversationMembers)
      .set({ lastReadSequence: sql`9007199254740993::bigint` })
      .where(memberWhere);
    await expectOverflowToFail();
    await database.db.update(schema.conversationMembers)
      .set({ lastReadSequence: 0 })
      .where(memberWhere);

    await database.db.update(schema.conversationMembers)
      .set({
        lastReadSequence: sql`9007199254740993::bigint`,
        receiptSequence: sql`9007199254740993::bigint`,
      })
      .where(memberWhere);
    await expectOverflowToFail();
  });
});
