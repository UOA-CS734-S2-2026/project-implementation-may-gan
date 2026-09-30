import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDayliDatabase } from "@dayli/db";
import { createPostgresOutboxStore } from "./outbox-store";

const connectionString = process.env.MESSAGING_DELIVERY_TEST_DATABASE_URL ?? process.env.MESSAGING_TEST_DATABASE_URL;
const suite = connectionString ? describe : describe.skip;

suite("Postgres outbox leasing", () => {
  const database = createDayliDatabase(connectionString ?? "postgresql://invalid/messaging_delivery");
  const store = createPostgresOutboxStore(database.db);
  const ids = { low: `delivery-a-${crypto.randomUUID()}`, high: `delivery-b-${crypto.randomUUID()}`, conversation: `delivery-c-${crypto.randomUUID()}`, job: `delivery-j-${crypto.randomUUID()}` };
  const now = new Date("2026-09-28T00:00:00.000Z");
  const nowIso = now.toISOString();

  beforeAll(async () => {
    await database.client`insert into public."user" (id, name, email) values (${ids.low}, ${ids.low}, ${ids.low + "@example.test"}), (${ids.high}, ${ids.high}, ${ids.high + "@example.test"})`;
    await database.client`insert into public.conversations (id, kind, participant_low_id, participant_high_id, initiator_participant_id, request_state, last_message_sequence, last_change_sequence, last_activity_at, created_at, updated_at) values (${ids.conversation}, 'direct', ${ids.low}, ${ids.high}, ${ids.low}, 'active', 0, 0, ${nowIso}, ${nowIso}, ${nowIso})`;
    await database.client`insert into public.messaging_outbox (id, event_id, recipient_id, conversation_id, change_sequence, channel, status, attempts, available_at, created_at) values (${ids.job}, ${crypto.randomUUID()}, ${ids.high}, ${ids.conversation}, 1, 'realtime', 'pending', 0, ${nowIso}, ${nowIso})`;
  });

  afterAll(async () => {
    try {
      await database.client`delete from public."user" where id = any(${[ids.low, ids.high]}::text[])`;
    } finally { await database.close(); }
  });

  it("claims once, fences stale completion, and permits expired lease recovery", async () => {
    const [first, second] = await Promise.all([
      store.claimDue({ now, limit: 1, leaseForMs: 1_000, maxAttempts: 3, leaseToken: () => "first" }),
      store.claimDue({ now, limit: 1, leaseForMs: 1_000, maxAttempts: 3, leaseToken: () => "second" }),
    ]);
    const claimed = [...first, ...second];
    expect(claimed).toHaveLength(1);
    const original = claimed[0]!;
    const [reclaimed] = await store.claimDue({ now: new Date(now.getTime() + 1_001), limit: 1, leaseForMs: 1_000, maxAttempts: 3, leaseToken: () => "reclaimed" });
    expect(reclaimed).toMatchObject({ id: ids.job, attempts: 2, leaseToken: "reclaimed" });
    await expect(store.markDelivered(original, new Date())).resolves.toBe(false);
    await expect(store.markDelivered(reclaimed!, new Date())).resolves.toBe(true);
  });

  it("extends a live lease before a provider effect and fences its previous owner", async () => {
    const renewedJob = `delivery-r-${crypto.randomUUID()}`;
    await database.client`insert into public.messaging_outbox (id, event_id, recipient_id, conversation_id, change_sequence, channel, status, attempts, available_at, created_at) values (${renewedJob}, ${crypto.randomUUID()}, ${ids.high}, ${ids.conversation}, 2, 'realtime', 'pending', 0, ${nowIso}, ${nowIso})`;
    const [active] = await store.claimDue({ now, limit: 1, leaseForMs: 1_000, maxAttempts: 3, leaseToken: () => "owner" });
    expect(active).toBeDefined();
    const renewed = await store.renewLease(active!, { now: new Date(now.getTime() + 900), leaseForMs: 1_000 });
    expect(renewed).toMatchObject({ id: active!.id, leaseToken: "owner" });
    const competingBeforeRenewalExpires = await store.claimDue({ now: new Date(now.getTime() + 1_001), limit: 10, leaseForMs: 1_000, maxAttempts: 3, leaseToken: () => "competitor" });
    expect(competingBeforeRenewalExpires).toHaveLength(0);
    const [reclaimed] = await store.claimDue({ now: new Date(now.getTime() + 1_901), limit: 1, leaseForMs: 1_000, maxAttempts: 3, leaseToken: () => "competitor" });
    expect(reclaimed).toMatchObject({ id: active!.id, leaseToken: "competitor" });
    await expect(store.markDelivered(active!, new Date())).resolves.toBe(false);
  });
});
