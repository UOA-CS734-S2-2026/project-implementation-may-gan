import { createDayliDatabase, schema, sql } from "@dayli/db";
import { and, asc, eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { appendConversationChange } from "../append-conversation-change";

const connectionString = process.env.MESSAGING_TEST_DATABASE_URL;
const enabled = Boolean(connectionString);
const target = connectionString ? new URL(connectionString) : undefined;
if (enabled && target?.hostname === "localhost" && target.port === "5433" && target.pathname !== "/dayli_messaging_test") {
  throw new Error("MESSAGING_TEST_DATABASE_URL must use the isolated dayli_messaging_test database.");
}
const suite = enabled ? describe : describe.skip;

suite("conversation change builders", () => {
  const database = createDayliDatabase(connectionString ?? "postgresql://invalid/messaging_tests");
  const users = [
    `append-change-a-${crypto.randomUUID()}`,
    `append-change-b-${crypto.randomUUID()}`,
  ];

  beforeAll(async () => {
    await database.db.insert(schema.user).values(users.map((id) => ({ id, name: id, email: `${id}@example.test` })));
  });

  afterAll(async () => {
    try {
      await database.db.delete(schema.user).where(inArray(schema.user.id, users));
    } finally {
      await database.close();
    }
  });

  async function createConversation() {
    const conversationId = crypto.randomUUID();
    const messageId = crypto.randomUUID();
    const now = new Date("2026-09-30T00:00:00.000Z");
    await database.db.delete(schema.conversations).where(and(
      eq(schema.conversations.userLowId, users[0]!),
      eq(schema.conversations.userHighId, users[1]!),
    ));
    await database.db.insert(schema.conversations).values({
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
    await database.db.insert(schema.messages).values({
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
    return { conversationId, messageId, now };
  }

  it("rolls back every append write when its caller rolls back", async () => {
    const { conversationId } = await createConversation();
    await expect(database.db.transaction(async (transaction) => {
      await appendConversationChange(transaction, conversationId, "read.updated", null, users[0]!, new Date());
      transaction.rollback();
    })).rejects.toBeDefined();

    const [conversation] = await database.db.select({ lastChangeSequence: schema.conversations.lastChangeSequence })
      .from(schema.conversations)
      .where(eq(schema.conversations.id, conversationId));
    const [changes] = await database.db.select({ count: sql<number>`count(*)::int` })
      .from(schema.conversationChanges)
      .where(eq(schema.conversationChanges.conversationId, conversationId));
    const [outbox] = await database.db.select({ count: sql<number>`count(*)::int` })
      .from(schema.messagingOutbox)
      .where(eq(schema.messagingOutbox.conversationId, conversationId));
    expect(String(conversation?.lastChangeSequence)).toBe("0");
    expect(changes?.count).toBe(0);
    expect(outbox?.count).toBe(0);
  });

  it("preserves safe change sequences and sends only eligible peer devices", async () => {
    const { conversationId, messageId, now } = await createConversation();
    const sessionId = crypto.randomUUID();
    await database.db.insert(schema.session).values({
      id: sessionId,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1_000),
      token: crypto.randomUUID(),
      createdAt: now,
      updatedAt: now,
      userId: users[1]!,
    });
    const validDeviceId = crypto.randomUUID();
    const secondValidDeviceId = crypto.randomUUID();
    await database.db.insert(schema.pushDevices).values([
      {
        id: validDeviceId,
        userId: users[1]!,
        sessionId,
        installationId: crypto.randomUUID(),
        platform: "ios",
        token: "token-valid",
        tokenCiphertext: "cipher-valid",
        tokenKeyVersion: "v1",
        tokenHash: "a".repeat(64),
        optedIn: true,
        registeredAt: now,
        invalidatedAt: null,
      },
      {
        id: secondValidDeviceId,
        userId: users[1]!,
        sessionId,
        installationId: crypto.randomUUID(),
        platform: "android",
        token: "token-valid-second",
        tokenCiphertext: "cipher-valid-second",
        tokenKeyVersion: "v1",
        tokenHash: "b".repeat(64),
        optedIn: true,
        registeredAt: now,
        invalidatedAt: null,
      },
      {
        id: crypto.randomUUID(),
        userId: users[1]!,
        sessionId,
        installationId: crypto.randomUUID(),
        platform: "ios",
        token: "token-opted-out",
        tokenCiphertext: "cipher-opted-out",
        tokenKeyVersion: "v1",
        tokenHash: "c".repeat(64),
        optedIn: false,
        registeredAt: now,
        invalidatedAt: null,
      },
      {
        id: crypto.randomUUID(),
        userId: users[1]!,
        sessionId,
        installationId: crypto.randomUUID(),
        platform: "ios",
        token: "token-invalidated",
        tokenCiphertext: "cipher-invalidated",
        tokenKeyVersion: "v1",
        tokenHash: "d".repeat(64),
        optedIn: true,
        registeredAt: now,
        invalidatedAt: now,
      },
      {
        id: crypto.randomUUID(),
        userId: users[1]!,
        sessionId,
        installationId: crypto.randomUUID(),
        platform: "ios",
        token: "token-missing-key",
        tokenCiphertext: "cipher-missing-key",
        tokenKeyVersion: null,
        tokenHash: "e".repeat(64),
        optedIn: true,
        registeredAt: now,
        invalidatedAt: null,
      },
    ]);
    await database.db.update(schema.conversations)
      .set({ lastChangeSequence: 9007199254740990 })
      .where(eq(schema.conversations.id, conversationId));

    await database.db.transaction((transaction) =>
      appendConversationChange(transaction, conversationId, "message.created", messageId, null, now));

    const [change] = await database.db.select({ changeSequence: schema.conversationChanges.changeSequence })
      .from(schema.conversationChanges)
      .where(eq(schema.conversationChanges.conversationId, conversationId));
    const realtime = await database.db.select({
      recipient_id: schema.messagingOutbox.recipientId,
      event_id: schema.messagingOutbox.eventId,
      change_sequence: schema.messagingOutbox.changeSequence,
      available_at: schema.messagingOutbox.availableAt,
      created_at: schema.messagingOutbox.createdAt,
    }).from(schema.messagingOutbox).where(and(
      eq(schema.messagingOutbox.conversationId, conversationId),
      eq(schema.messagingOutbox.channel, "realtime"),
    )).orderBy(asc(schema.messagingOutbox.recipientId));
    const push = await database.db.select({
      recipient_id: schema.messagingOutbox.recipientId,
      event_id: schema.messagingOutbox.eventId,
      change_sequence: schema.messagingOutbox.changeSequence,
      device_registration_id: schema.messagingOutbox.deviceRegistrationId,
      available_at: schema.messagingOutbox.availableAt,
      created_at: schema.messagingOutbox.createdAt,
    }).from(schema.messagingOutbox).where(and(
      eq(schema.messagingOutbox.conversationId, conversationId),
      eq(schema.messagingOutbox.channel, "push"),
    ));
    expect(String(change?.changeSequence)).toBe("9007199254740991");
    expect(realtime).toHaveLength(2);
    expect(realtime.map((row) => String(row.change_sequence))).toEqual(["9007199254740991", "9007199254740991"]);
    expect(new Set(realtime.map((row) => row.event_id)).size).toBe(1);
    expect(realtime.map((row) => new Date(String(row.available_at)).toISOString())).toEqual([now.toISOString(), now.toISOString()]);
    expect(realtime.map((row) => new Date(String(row.created_at)).toISOString())).toEqual([now.toISOString(), now.toISOString()]);
    expect(push).toHaveLength(2);
    expect(push.map((row) => row.recipient_id)).toEqual([users[1], users[1]]);
    expect(push.map((row) => row.device_registration_id).sort()).toEqual([validDeviceId, secondValidDeviceId].sort());
    expect(push.map((row) => String(row.change_sequence))).toEqual(["9007199254740991", "9007199254740991"]);
    expect(new Set(push.map((row) => row.event_id)).size).toBe(2);
    expect(push.map((row) => new Date(String(row.available_at)).toISOString())).toEqual([now.toISOString(), now.toISOString()]);
    expect(push.map((row) => new Date(String(row.created_at)).toISOString())).toEqual([now.toISOString(), now.toISOString()]);
  });

  it("rejects an unsafe increment and rolls back every caller write", async () => {
    const { conversationId, messageId, now } = await createConversation();
    await database.db.update(schema.conversations)
      .set({ lastChangeSequence: sql`9007199254740991::bigint` })
      .where(eq(schema.conversations.id, conversationId));

    await expect(database.db.transaction((transaction) =>
      appendConversationChange(transaction, conversationId, "message.created", messageId, null, now)))
      .rejects.toThrow("Database sequence must be a safe nonnegative integer.");

    const [conversation] = await database.db.select({ lastChangeSequence: schema.conversations.lastChangeSequence })
      .from(schema.conversations)
      .where(eq(schema.conversations.id, conversationId));
    const [changes] = await database.db.select({ count: sql<number>`count(*)::int` })
      .from(schema.conversationChanges)
      .where(eq(schema.conversationChanges.conversationId, conversationId));
    const [outbox] = await database.db.select({ count: sql<number>`count(*)::int` })
      .from(schema.messagingOutbox)
      .where(eq(schema.messagingOutbox.conversationId, conversationId));
    expect(String(conversation?.lastChangeSequence)).toBe("9007199254740991");
    expect(changes?.count).toBe(0);
    expect(outbox?.count).toBe(0);
  });
});
