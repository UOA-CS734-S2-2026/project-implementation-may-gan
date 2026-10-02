import { createDayliDatabase, schema } from "@dayli/db";
import { and, count, eq, inArray, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { updateMessageRow } from "../update-message-row";

const { conversations, messageReactions, messages, user } = schema;
const connectionString = process.env.MESSAGING_TEST_DATABASE_URL;
const enabled = Boolean(connectionString);
const target = connectionString ? new URL(connectionString) : undefined;
if (enabled && target?.hostname === "localhost" && target.port === "5433" && target.pathname !== "/dayli_messaging_test") {
  throw new Error("MESSAGING_TEST_DATABASE_URL must use the isolated dayli_messaging_test database.");
}
const suite = enabled ? describe : describe.skip;

suite("message row update builders", () => {
  const database = createDayliDatabase(connectionString ?? "postgresql://invalid/messaging_tests");
  const users = [
    `update-message-a-${crypto.randomUUID()}`,
    `update-message-b-${crypto.randomUUID()}`,
  ];

  beforeAll(async () => {
    await database.db.insert(user).values(users.map((id) => ({ id, name: id, email: `${id}@example.test` })));
  });

  afterAll(async () => {
    try {
      await database.db.delete(user).where(inArray(user.id, users));
    } finally {
      await database.close();
    }
  });

  it("enforces CAS updates and removes reactions only for an explicit unsend", async () => {
    const conversationId = crypto.randomUUID();
    const messageId = crypto.randomUUID();
    const now = new Date("2026-09-30T00:00:00.000Z");
    await database.db.insert(conversations).values({
      id: conversationId,
      kind: "direct",
      userLowId: users[0]!,
      userHighId: users[1]!,
      initiatorId: users[0]!,
      requestState: "active",
      lastMessageSequence: 1,
      lastChangeSequence: 0,
      lastActivityAt: now,
      createdAt: now,
      updatedAt: now,
    });
    await database.db.insert(messages).values({
      id: messageId,
      conversationId,
      sequence: 1,
      senderId: users[0]!,
      clientMessageId: crypto.randomUUID(),
      requestFingerprint: crypto.randomUUID(),
      body: "message",
      version: 1,
      createdAt: now,
    });
    await database.db.insert(messageReactions).values({ messageId, userId: users[1]!, participantId: users[1]!, reaction: "love", createdAt: now });

    await expect(updateMessageRow(database.db, {
      messageId,
      body: "edited",
      editedAt: now,
      expectedVersion: 1,
    })).resolves.toMatchObject({ body: "edited", version: 2 });
    await expect(updateMessageRow(database.db, {
      messageId,
      body: "stale",
      expectedVersion: 1,
    })).rejects.toThrow("Message write conflict.");
    const [retained] = await database.db.select({ count: count() }).from(messageReactions).where(eq(messageReactions.messageId, messageId));
    expect(retained?.count).toBe(1);

    await expect(updateMessageRow(database.db, {
      messageId,
      body: null,
      unsentAt: now,
    })).resolves.toMatchObject({ body: null, unsentAt: now, version: 3 });
    const [message] = await database.db.select({ body: messages.body, unsentAt: messages.unsentAt }).from(messages).where(eq(messages.id, messageId));
    const [reactions] = await database.db.select({ count: count() }).from(messageReactions).where(eq(messageReactions.messageId, messageId));
    expect(message?.body).toBeNull();
    expect(message?.unsentAt).not.toBeNull();
    expect(reactions?.count).toBe(0);
  });

  it("accepts Number.MAX_SAFE_INTEGER and fails closed for an unsafe returned sequence", async () => {
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
      lastMessageSequence: 1,
      lastChangeSequence: 0,
      lastActivityAt: now,
      createdAt: now,
      updatedAt: now,
    });
    await database.db.insert(messages).values({
      id: messageId,
      conversationId,
      sequence: 1,
      senderId: users[0]!,
      clientMessageId: crypto.randomUUID(),
      requestFingerprint: crypto.randomUUID(),
      body: "message",
      version: Number.MAX_SAFE_INTEGER - 1,
      createdAt: now,
    });
    await database.db.insert(messageReactions).values({ messageId, userId: users[1]!, participantId: users[1]!, reaction: "love", createdAt: now });

    await expect(database.db.transaction((transaction) => updateMessageRow(transaction, {
      messageId,
      body: "maximum safe version",
      expectedVersion: Number.MAX_SAFE_INTEGER - 1,
    }))).resolves.toMatchObject({ body: "maximum safe version", version: Number.MAX_SAFE_INTEGER });

    await database.db.update(messages).set({ sequence: sql`9007199254740992::bigint` }).where(eq(messages.id, messageId));
    await expect(database.db.transaction((transaction) => updateMessageRow(transaction, {
      messageId,
      body: null,
      unsentAt: now,
      expectedVersion: Number.MAX_SAFE_INTEGER,
    }))).rejects.toThrow(RangeError);

    const [message] = await database.db.select({ sequence: sql<string>`${messages.sequence}::text`, body: messages.body, unsentAt: messages.unsentAt, version: sql<string>`${messages.version}::text` }).from(messages).where(eq(messages.id, messageId));
    const [reactions] = await database.db.select({ count: count() }).from(messageReactions).where(eq(messageReactions.messageId, messageId));
    expect(message).toMatchObject({
      sequence: "9007199254740992",
      body: "maximum safe version",
      unsentAt: null,
      version: String(Number.MAX_SAFE_INTEGER),
    });
    expect(reactions?.count).toBe(1);
  });
});
