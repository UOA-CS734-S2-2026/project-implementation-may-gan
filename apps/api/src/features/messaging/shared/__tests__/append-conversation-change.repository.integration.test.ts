import { createDayliDatabase, schema, sql } from "@dayli/db";
import { and, asc, eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPostgresDirectMessageNotificationResolver } from "../../../../infrastructure/notifications/direct-message-resolver";
import { createPostgresNotificationStore } from "../../../../infrastructure/notifications/notification-store";
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
    await database.db.insert(schema.conversationMembers).values([
      {
        conversationId,
        userId: users[0]!,
        participantId: users[0]!,
        lastReadSequence: 0,
        receiptSequence: 0,
        createdAt: now,
        updatedAt: now,
      },
      {
        conversationId,
        userId: users[1]!,
        participantId: users[1]!,
        lastReadSequence: 0,
        receiptSequence: 0,
        createdAt: now,
        updatedAt: now,
      },
    ]);
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

  it("rolls back the source change, realtime jobs, and notification intent together", async () => {
    const { conversationId, messageId } = await createConversation();
    await expect(database.db.transaction(async (transaction) => {
      await appendConversationChange(transaction, conversationId, "message.created", messageId, null, new Date(), {
        notificationPublishersEnabled: true,
      });
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
    const [notifications] = await database.db.select({ count: sql<number>`count(*)::int` })
      .from(schema.notificationEvents)
      .where(eq(schema.notificationEvents.sourceId, messageId));
    expect(String(conversation?.lastChangeSequence)).toBe("0");
    expect(changes?.count).toBe(0);
    expect(outbox?.count).toBe(0);
    expect(notifications?.count).toBe(0);
  });

  it("preserves safe change sequences and sends only eligible peer devices", async () => {
    const { conversationId, messageId, now } = await createConversation();
    const sessionId = crypto.randomUUID();
    await database.db.insert(schema.session).values({
      id: sessionId,
      // Push eligibility compares against the database's real clock (now()), so
      // a fixed date would expire and silently drop every push row.
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1_000),
      token: crypto.randomUUID(),
      createdAt: now,
      updatedAt: now,
      userId: users[1]!,
    });
    await database.db.insert(schema.accountNotificationPreferences).values({ userId: users[1]!, enabled: true });
    const validDeviceId = crypto.randomUUID();
    const secondValidDeviceId = crypto.randomUUID();
    const capableDeviceId = crypto.randomUUID();
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
        id: capableDeviceId,
        userId: users[1]!,
        sessionId,
        installationId: crypto.randomUUID(),
        platform: "ios",
        token: "token-capable",
        tokenCiphertext: "cipher-capable",
        tokenKeyVersion: "v1",
        tokenHash: "f".repeat(64),
        optedIn: true,
        notificationSchemaVersion: 1,
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
      appendConversationChange(transaction, conversationId, "message.created", messageId, null, now, {
        notificationPublishersEnabled: true,
      }));

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

    const events = await database.db.select().from(schema.notificationEvents)
      .where(eq(schema.notificationEvents.sourceId, messageId));
    const deliveries = await database.db.select().from(schema.notificationDeliveries)
      .where(eq(schema.notificationDeliveries.eventId, events[0]!.id));
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      kind: "direct_message", recipientId: users[1], sourceType: "message", sourceId: messageId,
      targetType: "conversation", targetId: conversationId,
    });
    expect(deliveries).toHaveLength(1);
    expect(deliveries[0]).toMatchObject({ recipientId: users[1], deviceRegistrationId: capableDeviceId });

    const resolver = createPostgresDirectMessageNotificationResolver(database.db, {
      encrypt: async () => ({ ciphertext: "unused", keyVersion: "unused" }),
      decrypt: async () => "fake-provider-token",
    });
    const deliveryJob = {
      id: deliveries[0]!.id,
      eventId: events[0]!.id,
      recipientId: users[1]!,
      deviceRegistrationId: capableDeviceId,
      attempts: 1,
      leaseToken: "test-lease",
      leaseExpiresAt: new Date(Date.now() + 30_000),
    };
    await expect(resolver.resolve(deliveryJob)).resolves.toMatchObject({
      token: "fake-provider-token", title: users[0], body: "message", targetId: conversationId,
    });

    await database.db.update(schema.messages).set({ body: "edited preview", editedAt: new Date() })
      .where(eq(schema.messages.id, messageId));
    await expect(resolver.resolve(deliveryJob)).resolves.toMatchObject({ body: "edited preview" });

    await database.db.update(schema.accountNotificationPreferences).set({ enabled: false })
      .where(eq(schema.accountNotificationPreferences.userId, users[1]!));
    await expect(resolver.resolve(deliveryJob)).resolves.toBeNull();
    await database.db.update(schema.accountNotificationPreferences).set({ enabled: true })
      .where(eq(schema.accountNotificationPreferences.userId, users[1]!));

    await database.db.update(schema.pushDevices).set({ notificationSchemaVersion: null })
      .where(eq(schema.pushDevices.id, capableDeviceId));
    await expect(resolver.resolve(deliveryJob)).resolves.toBeNull();
    await database.db.update(schema.pushDevices).set({ notificationSchemaVersion: 1 })
      .where(eq(schema.pushDevices.id, capableDeviceId));

    await database.db.update(schema.session).set({ expiresAt: new Date(Date.now() - 1_000) })
      .where(eq(schema.session.id, sessionId));
    await expect(resolver.resolve(deliveryJob)).resolves.toBeNull();
    await database.db.update(schema.session).set({ expiresAt: new Date(Date.now() + 60_000) })
      .where(eq(schema.session.id, sessionId));

    await database.db.insert(schema.relationshipBlocks).values({
      blockerId: users[0]!, blockedId: users[1]!, blockedAt: new Date(),
    });
    await expect(resolver.resolve(deliveryJob)).resolves.toBeNull();
    await database.db.delete(schema.relationshipBlocks).where(and(
      eq(schema.relationshipBlocks.blockerId, users[0]!),
      eq(schema.relationshipBlocks.blockedId, users[1]!),
    ));

    await database.db.update(schema.messages).set({ body: null, unsentAt: new Date() })
      .where(eq(schema.messages.id, messageId));
    await expect(resolver.resolve(deliveryJob)).resolves.toBeNull();

    const store = createPostgresNotificationStore(database.db);
    const claimAt = new Date();
    const claims = await Promise.all([
      store.claimDue({ now: claimAt, limit: 1, leaseForMs: 30_000, maxAttempts: 12, leaseToken: () => "lease-a" }),
      store.claimDue({ now: claimAt, limit: 1, leaseForMs: 30_000, maxAttempts: 12, leaseToken: () => "lease-b" }),
    ]);
    expect(claims.flat()).toHaveLength(1);
    const staleClaim = claims.flat()[0]!;
    await database.db.update(schema.notificationDeliveries)
      .set({ leaseExpiresAt: new Date(claimAt.getTime() - 1) })
      .where(eq(schema.notificationDeliveries.id, staleClaim.id));
    const [reclaimed] = await store.claimDue({
      now: claimAt, limit: 1, leaseForMs: 30_000, maxAttempts: 12, leaseToken: () => "lease-reclaimed",
    });
    expect(reclaimed).toMatchObject({ id: staleClaim.id, leaseToken: "lease-reclaimed", attempts: 2 });
    await expect(store.markDelivered(staleClaim, claimAt)).resolves.toBe(false);
    await expect(store.markSuppressed(reclaimed!, "ineligible")).resolves.toBe(true);
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
