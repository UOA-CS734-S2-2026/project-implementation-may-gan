import { createDayliDatabase, schema } from "@dayli/db";
import { and, eq, inArray, or } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import type { OutboxJob } from "../jobs/outbox-store";
import { canPublishCurrentChange } from "./publisher";

const connectionString = process.env.MESSAGING_DELIVERY_TEST_DATABASE_URL ?? process.env.MESSAGING_TEST_DATABASE_URL;
const target = connectionString ? new URL(connectionString) : undefined;
if (target?.hostname === "localhost" && target.port === "5433" && target.pathname !== "/dayli_messaging_test") {
  throw new Error("Realtime publisher integration tests must use the isolated dayli_messaging_test database.");
}
const suite = connectionString ? describe : describe.skip;

suite("Postgres realtime publisher authorization", () => {
  const database = createDayliDatabase(connectionString ?? "postgresql://invalid/realtime_publisher");
  const ids = {
    alice: `realtime-publisher-a-${crypto.randomUUID()}`,
    bob: `realtime-publisher-b-${crypto.randomUUID()}`,
    conversation: `realtime-publisher-c-${crypto.randomUUID()}`,
  };
  const createdAt = new Date();

  function job(row: { id: string; recipientId: string; changeSequence: number; leaseToken: string }): OutboxJob {
    return {
      id: row.id,
      eventId: `realtime-publisher-event-${crypto.randomUUID()}`,
      recipientId: row.recipientId,
      conversationId: ids.conversation,
      changeSequence: String(row.changeSequence),
      channel: "realtime",
      deviceRegistrationId: null,
      attempts: 1,
      leaseToken: row.leaseToken,
      leaseExpiresAt: new Date(Date.now() + 60_000),
    };
  }

  async function insertChange(input: { sequence: number; senderId?: string; memberId?: string }): Promise<void> {
    const messageId = input.senderId ? `realtime-publisher-message-${crypto.randomUUID()}` : null;
    if (messageId) {
      await database.db.insert(schema.messages).values({
        id: messageId, conversationId: ids.conversation, sequence: input.sequence, senderId: input.senderId!,
        clientMessageId: `client-${messageId}`, requestFingerprint: `fingerprint-${messageId}`, body: "body", createdAt,
      });
    }
    await database.db.insert(schema.conversationChanges).values({
      conversationId: ids.conversation, changeSequence: input.sequence, kind: "realtime.test", messageId,
      memberId: input.memberId ?? null, createdAt,
    });
  }

  async function insertLeasedJob(input: { recipientId: string; changeSequence: number; leaseToken?: string; leaseExpiresAt?: Date }): Promise<OutboxJob> {
    const id = `realtime-publisher-job-${crypto.randomUUID()}`;
    const leaseToken = input.leaseToken ?? `lease-${crypto.randomUUID()}`;
    const leaseExpiresAt = input.leaseExpiresAt ?? new Date(Date.now() + 60_000);
    await database.db.insert(schema.messagingOutbox).values({
      id, eventId: crypto.randomUUID(), recipientId: input.recipientId, conversationId: ids.conversation,
      changeSequence: input.changeSequence, channel: "realtime", status: "leased", attempts: 1,
      availableAt: createdAt, leaseToken, leaseExpiresAt, createdAt,
    });
    return job({ id, recipientId: input.recipientId, changeSequence: input.changeSequence, leaseToken });
  }

  beforeAll(async () => {
    await database.db.insert(schema.user).values([
      { id: ids.alice, name: ids.alice, email: `${ids.alice}@example.test` },
      { id: ids.bob, name: ids.bob, email: `${ids.bob}@example.test` },
    ]);
    await database.db.insert(schema.conversations).values({
      id: ids.conversation, kind: "direct", userLowId: ids.alice, userHighId: ids.bob, initiatorId: ids.alice,
      requestState: "active", lastMessageSequence: 0, lastChangeSequence: 0, lastActivityAt: createdAt, createdAt, updatedAt: createdAt,
    });
    await database.db.insert(schema.conversationMembers).values([
      { conversationId: ids.conversation, userId: ids.alice, lastReadSequence: 0, receiptSequence: 0, createdAt, updatedAt: createdAt },
      { conversationId: ids.conversation, userId: ids.bob, lastReadSequence: 0, receiptSequence: 0, createdAt, updatedAt: createdAt },
    ]);
  });

  const isTestUserBlock = or(
    inArray(schema.relationshipBlocks.blockerId, [ids.alice, ids.bob]),
    inArray(schema.relationshipBlocks.blockedId, [ids.alice, ids.bob]),
  );

  afterEach(async () => {
    await database.db.delete(schema.relationshipBlocks).where(isTestUserBlock);
    await database.db.delete(schema.messagingOutbox).where(eq(schema.messagingOutbox.conversationId, ids.conversation));
    await database.db.delete(schema.conversationChanges).where(eq(schema.conversationChanges.conversationId, ids.conversation));
    await database.db.delete(schema.messages).where(eq(schema.messages.conversationId, ids.conversation));
    await database.db.insert(schema.conversationMembers).values([
      { conversationId: ids.conversation, userId: ids.alice, lastReadSequence: 0, receiptSequence: 0, createdAt, updatedAt: createdAt },
      { conversationId: ids.conversation, userId: ids.bob, lastReadSequence: 0, receiptSequence: 0, createdAt, updatedAt: createdAt },
    ]).onConflictDoNothing({ target: [schema.conversationMembers.conversationId, schema.conversationMembers.userId] });
  });

  afterAll(async () => {
    try {
      await database.db.delete(schema.relationshipBlocks).where(isTestUserBlock);
      await database.db.delete(schema.user).where(inArray(schema.user.id, [ids.alice, ids.bob]));
    } finally {
      await database.close();
    }
  });

  it("rejects a stale lease even when the token still matches", async () => {
    await insertChange({ sequence: 1, senderId: ids.alice });
    const stale = await insertLeasedJob({ recipientId: ids.bob, changeSequence: 1, leaseExpiresAt: new Date(Date.now() - 1_000) });

    await expect(canPublishCurrentChange({ connectionString: connectionString! }, stale)).resolves.toBe(false);
  });

  it("allows a blocked actor's message invalidation but suppresses the peer", async () => {
    await insertChange({ sequence: 1, senderId: ids.alice });
    const actor = await insertLeasedJob({ recipientId: ids.alice, changeSequence: 1 });
    const peer = await insertLeasedJob({ recipientId: ids.bob, changeSequence: 1 });
    await database.db.insert(schema.relationshipBlocks).values({ blockerId: ids.alice, blockedId: ids.bob, blockedAt: createdAt });

    await expect(canPublishCurrentChange({ connectionString: connectionString! }, actor)).resolves.toBe(true);
    await expect(canPublishCurrentChange({ connectionString: connectionString! }, peer)).resolves.toBe(false);
  });

  it("uses memberId when a blocked change has no message sender", async () => {
    await insertChange({ sequence: 1, memberId: ids.alice });
    const actor = await insertLeasedJob({ recipientId: ids.alice, changeSequence: 1 });
    const peer = await insertLeasedJob({ recipientId: ids.bob, changeSequence: 1 });
    await database.db.insert(schema.relationshipBlocks).values({ blockerId: ids.alice, blockedId: ids.bob, blockedAt: createdAt });

    await expect(canPublishCurrentChange({ connectionString: connectionString! }, actor)).resolves.toBe(true);
    await expect(canPublishCurrentChange({ connectionString: connectionString! }, peer)).resolves.toBe(false);
  });

  it("rejects a recipient whose membership was removed", async () => {
    await insertChange({ sequence: 1, senderId: ids.alice });
    const recipient = await insertLeasedJob({ recipientId: ids.bob, changeSequence: 1 });
    await database.db.delete(schema.conversationMembers).where(and(
      eq(schema.conversationMembers.conversationId, ids.conversation),
      eq(schema.conversationMembers.userId, ids.bob),
    ));

    await expect(canPublishCurrentChange({ connectionString: connectionString! }, recipient)).resolves.toBe(false);
  });

  it("rejects a job that names a different recipient than its leased row", async () => {
    await insertChange({ sequence: 1, senderId: ids.alice });
    const recipient = await insertLeasedJob({ recipientId: ids.bob, changeSequence: 1 });

    await expect(canPublishCurrentChange({ connectionString: connectionString! }, { ...recipient, recipientId: ids.alice })).resolves.toBe(false);
  });
});
