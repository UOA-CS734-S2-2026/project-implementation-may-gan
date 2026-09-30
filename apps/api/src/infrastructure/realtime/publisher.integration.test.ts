import { createDayliDatabase } from "@dayli/db";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { OutboxJob } from "../jobs/outbox-store";
import { canPublishCurrentChange, createDurableObjectRealtimePublisher } from "./publisher";
import { createRealtimeDeliveryAuthorizer } from "../jobs/messaging-delivery-runtime";

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
  const createdAt = new Date().toISOString();

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
      await database.client`insert into public.messages (id, conversation_id, sequence, sender_id, client_message_id, request_fingerprint, body, created_at) values (${messageId}, ${ids.conversation}, ${input.sequence}, ${input.senderId!}, ${`client-${messageId}`}, ${`fingerprint-${messageId}`}, 'body', ${createdAt})`;
    }
    await database.client`insert into public.conversation_changes (conversation_id, change_sequence, kind, message_id, member_id, created_at) values (${ids.conversation}, ${input.sequence}, 'realtime.test', ${messageId}, ${input.memberId ?? null}, ${createdAt})`;
  }

  async function insertLeasedJob(input: { recipientId: string; changeSequence: number; leaseToken?: string; leaseExpiresAt?: Date }): Promise<OutboxJob> {
    const id = `realtime-publisher-job-${crypto.randomUUID()}`;
    const leaseToken = input.leaseToken ?? `lease-${crypto.randomUUID()}`;
    const leaseExpiresAt = input.leaseExpiresAt ?? new Date(Date.now() + 60_000);
    await database.client`insert into public.messaging_outbox (id, event_id, recipient_id, conversation_id, change_sequence, channel, status, attempts, available_at, lease_token, lease_expires_at, created_at) values (${id}, ${crypto.randomUUID()}, ${input.recipientId}, ${ids.conversation}, ${input.changeSequence}, 'realtime', 'leased', 1, ${createdAt}, ${leaseToken}, ${leaseExpiresAt.toISOString()}, ${createdAt})`;
    return job({ id, recipientId: input.recipientId, changeSequence: input.changeSequence, leaseToken });
  }

  beforeAll(async () => {
    await database.client`insert into public."user" (id, name, email) values (${ids.alice}, ${ids.alice}, ${ids.alice + "@example.test"}), (${ids.bob}, ${ids.bob}, ${ids.bob + "@example.test"})`;
    await database.client`insert into public.conversations (id, kind, user_low_id, user_high_id, initiator_id, request_state, last_message_sequence, last_change_sequence, last_activity_at, created_at, updated_at) values (${ids.conversation}, 'direct', ${ids.alice}, ${ids.bob}, ${ids.alice}, 'active', 0, 0, ${createdAt}, ${createdAt}, ${createdAt})`;
    await database.client`insert into public.conversation_members (conversation_id, user_id, last_read_sequence, receipt_sequence, created_at, updated_at) values (${ids.conversation}, ${ids.alice}, 0, 0, ${createdAt}, ${createdAt}), (${ids.conversation}, ${ids.bob}, 0, 0, ${createdAt}, ${createdAt})`;
  });

  afterEach(async () => {
    await database.client`delete from public.relationship_blocks where blocker_id in (${ids.alice}, ${ids.bob}) or blocked_id in (${ids.alice}, ${ids.bob})`;
    await database.client`delete from public.messaging_outbox where conversation_id = ${ids.conversation}`;
    await database.client`delete from public.conversation_changes where conversation_id = ${ids.conversation}`;
    await database.client`delete from public.messages where conversation_id = ${ids.conversation}`;
    await database.client`insert into public.conversation_members (conversation_id, user_id, last_read_sequence, receipt_sequence, created_at, updated_at) values (${ids.conversation}, ${ids.alice}, 0, 0, ${createdAt}, ${createdAt}), (${ids.conversation}, ${ids.bob}, 0, 0, ${createdAt}, ${createdAt}) on conflict (conversation_id, user_id) do nothing`;
  });

  afterAll(async () => {
    try {
      await database.client`delete from public.relationship_blocks where blocker_id in (${ids.alice}, ${ids.bob}) or blocked_id in (${ids.alice}, ${ids.bob})`;
      await database.client`delete from public."user" where id in (${ids.alice}, ${ids.bob})`;
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
    await database.client`insert into public.relationship_blocks (blocker_id, blocked_id, blocked_at) values (${ids.alice}, ${ids.bob}, ${createdAt})`;

    await expect(canPublishCurrentChange({ connectionString: connectionString! }, actor)).resolves.toBe(true);
    await expect(canPublishCurrentChange({ connectionString: connectionString! }, peer)).resolves.toBe(false);
  });

  it("uses memberId when a blocked change has no message sender", async () => {
    await insertChange({ sequence: 1, memberId: ids.alice });
    const actor = await insertLeasedJob({ recipientId: ids.alice, changeSequence: 1 });
    const peer = await insertLeasedJob({ recipientId: ids.bob, changeSequence: 1 });
    await database.client`insert into public.relationship_blocks (blocker_id, blocked_id, blocked_at) values (${ids.alice}, ${ids.bob}, ${createdAt})`;

    await expect(canPublishCurrentChange({ connectionString: connectionString! }, actor)).resolves.toBe(true);
    await expect(canPublishCurrentChange({ connectionString: connectionString! }, peer)).resolves.toBe(false);
  });

  it("rejects a recipient whose membership was removed", async () => {
    await insertChange({ sequence: 1, senderId: ids.alice });
    const recipient = await insertLeasedJob({ recipientId: ids.bob, changeSequence: 1 });
    await database.client`delete from public.conversation_members where conversation_id = ${ids.conversation} and user_id = ${ids.bob}`;

    await expect(canPublishCurrentChange({ connectionString: connectionString! }, recipient)).resolves.toBe(false);
  });

  it("rejects a job that names a different recipient than its leased row", async () => {
    await insertChange({ sequence: 1, senderId: ids.alice });
    const recipient = await insertLeasedJob({ recipientId: ids.bob, changeSequence: 1 });

    await expect(canPublishCurrentChange({ connectionString: connectionString! }, { ...recipient, recipientId: ids.alice })).resolves.toBe(false);
  });

  it("composes leased-outbox authorization with recipient policy before publishing", async () => {
    const published = vi.fn(async () => undefined);
    const namespace = { idFromName: (userId: string) => userId, get: () => ({ publish: published, revokeSession: async () => undefined }) } as unknown as DurableObjectNamespace;
    const hyperdrive = { connectionString: connectionString! };
    const ordinaryPolicy = { resolve: async () => ({ restriction: "active" as const, allowed: new Set(["ordinary" as const]) }) };
    const publisher = createDurableObjectRealtimePublisher(namespace, hyperdrive, createRealtimeDeliveryAuthorizer(hyperdrive, ordinaryPolicy));

    await insertChange({ sequence: 2, senderId: ids.alice });
    const blocked = await insertLeasedJob({ recipientId: ids.bob, changeSequence: 2 });
    await database.client`insert into public.relationship_blocks (blocker_id, blocked_id, blocked_at) values (${ids.alice}, ${ids.bob}, ${createdAt})`;
    await publisher.deliver(blocked);
    expect(published).not.toHaveBeenCalled();
    await database.client`delete from public.relationship_blocks where blocker_id = ${ids.alice} and blocked_id = ${ids.bob}`;

    await insertChange({ sequence: 3, senderId: ids.alice });
    const removedMember = await insertLeasedJob({ recipientId: ids.bob, changeSequence: 3 });
    await database.client`delete from public.conversation_members where conversation_id = ${ids.conversation} and user_id = ${ids.bob}`;
    await publisher.deliver(removedMember);
    expect(published).not.toHaveBeenCalled();
    await database.client`insert into public.conversation_members (conversation_id, user_id, last_read_sequence, receipt_sequence, created_at, updated_at) values (${ids.conversation}, ${ids.bob}, 0, 0, ${createdAt}, ${createdAt})`;

    await insertChange({ sequence: 4, senderId: ids.alice });
    const stale = await insertLeasedJob({ recipientId: ids.bob, changeSequence: 4, leaseExpiresAt: new Date(Date.now() - 1_000) });
    await publisher.deliver(stale);
    expect(published).not.toHaveBeenCalled();

    await insertChange({ sequence: 5, senderId: ids.alice });
    const policyFailure = await insertLeasedJob({ recipientId: ids.bob, changeSequence: 5 });
    const failingPublisher = createDurableObjectRealtimePublisher(namespace, hyperdrive, createRealtimeDeliveryAuthorizer(hyperdrive, { resolve: async () => { throw new Error("unavailable"); } }));
    await failingPublisher.deliver(policyFailure);
    expect(published).not.toHaveBeenCalled();

    await insertChange({ sequence: 6, senderId: ids.alice });
    const authorized = await insertLeasedJob({ recipientId: ids.bob, changeSequence: 6 });
    await expect(publisher.deliver(authorized)).resolves.toEqual({ ok: true });
    expect(published).toHaveBeenCalledTimes(1);
  });
});
