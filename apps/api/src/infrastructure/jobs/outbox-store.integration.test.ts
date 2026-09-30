import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { createDayliDatabase } from "@dayli/db";
import { createPostgresOutboxStore } from "./outbox-store";

const connectionString = process.env.MESSAGING_DELIVERY_TEST_DATABASE_URL ?? process.env.MESSAGING_TEST_DATABASE_URL;
const target = connectionString ? new URL(connectionString) : undefined;
if (target?.hostname === "localhost" && target.port === "5433" && target.pathname !== "/dayli_messaging_test") {
  throw new Error("Outbox leasing integration tests must use the isolated dayli_messaging_test database.");
}
const suite = connectionString ? describe : describe.skip;

suite("Postgres outbox leasing", () => {
  const database = createDayliDatabase(connectionString ?? "postgresql://invalid/messaging_delivery");
  const store = createPostgresOutboxStore(database.db);
  const ids = {
    low: `delivery-a-${crypto.randomUUID()}`,
    high: `delivery-b-${crypto.randomUUID()}`,
    conversation: `delivery-c-${crypto.randomUUID()}`,
  };
  const now = new Date("2026-09-28T00:00:00.000Z");
  const nowIso = now.toISOString();
  const jobIds: string[] = [];

  async function insertJob(id = `delivery-j-${crypto.randomUUID()}`, availableAt = now): Promise<string> {
    await database.client`insert into public.messaging_outbox (id, event_id, recipient_id, conversation_id, change_sequence, channel, status, attempts, available_at, created_at) values (${id}, ${crypto.randomUUID()}, ${ids.high}, ${ids.conversation}, 1, 'realtime', 'pending', 0, ${availableAt.toISOString()}, ${nowIso})`;
    jobIds.push(id);
    return id;
  }

  beforeAll(async () => {
    await database.client`insert into public."user" (id, name, email) values (${ids.low}, ${ids.low}, ${ids.low + "@example.test"}), (${ids.high}, ${ids.high}, ${ids.high + "@example.test"})`;
    await database.client`insert into public.conversations (id, kind, user_low_id, user_high_id, initiator_id, request_state, last_message_sequence, last_change_sequence, last_activity_at, created_at, updated_at) values (${ids.conversation}, 'direct', ${ids.low}, ${ids.high}, ${ids.low}, 'active', 0, 0, ${nowIso}, ${nowIso}, ${nowIso})`;
  });

  afterEach(async () => {
    await database.client`delete from public.messaging_outbox where id = any(${jobIds.splice(0)}::text[])`;
  });

  afterAll(async () => {
    try {
      await database.client`delete from public."user" where id = any(${[ids.low, ids.high]}::text[])`;
    } finally { await database.close(); }
  });

  it("skips a row locked by another connection and claims it after that transaction commits", async () => {
    const lockedId = await insertJob(`delivery-lock-${crypto.randomUUID()}`, new Date(now.getTime() - 1));
    const availableId = await insertJob(`delivery-available-${crypto.randomUUID()}`);
    const lockingDatabase = createDayliDatabase(connectionString!);
    const claimingDatabase = createDayliDatabase(connectionString!);
    const claimingStore = createPostgresOutboxStore(claimingDatabase.db);
    let allowCommit!: () => void;
    const commitGate = new Promise<void>((resolve) => { allowCommit = resolve; });
    let signalLocked!: () => void;
    let rejectLock!: (error: unknown) => void;
    const rowLocked = new Promise<void>((resolve, reject) => {
      signalLocked = resolve;
      rejectLock = reject;
    });
    let timeout: ReturnType<typeof setTimeout> | undefined;
    let lockTransaction: Promise<void> | undefined;
    let claimPromise: Promise<Awaited<ReturnType<typeof claimingStore.claimDue>>> | undefined;

    try {
      lockTransaction = lockingDatabase.client.begin(async (transaction) => {
        try {
          const [row] = await transaction`select id from public.messaging_outbox where id = ${lockedId} for update`;
          expect(row?.id).toBe(lockedId);
          signalLocked();
          await commitGate;
        } catch (error) {
          rejectLock(error);
          throw error;
        }
      });
      void lockTransaction.catch(() => undefined);
      await rowLocked;

      claimPromise = claimingStore.claimDue({ now, limit: 1, leaseForMs: 1_000, maxAttempts: 3, leaseToken: () => "second" });
      const claimedWhileLocked = await Promise.race([
        claimPromise,
        new Promise<never>((_, reject) => {
          timeout = setTimeout(() => reject(new Error("claimDue waited on a row that should have been skipped.")), 5_000);
        }),
      ]);
      expect(claimedWhileLocked).toHaveLength(1);
      const job = claimedWhileLocked[0]!;
      expect(Object.keys(job).sort()).toEqual([
        "attempts", "changeSequence", "channel", "conversationId", "deviceRegistrationId", "eventId", "id", "leaseExpiresAt", "leaseToken", "recipientId",
      ]);
      expect(job).toMatchObject({
        id: availableId,
        recipientId: ids.high,
        conversationId: ids.conversation,
        changeSequence: "1",
        channel: "realtime",
        deviceRegistrationId: null,
        attempts: 1,
        leaseExpiresAt: new Date(now.getTime() + 1_000),
      });

      allowCommit();
      await lockTransaction;
      const [claimedAfterCommit] = await claimingStore.claimDue({ now, limit: 1, leaseForMs: 1_000, maxAttempts: 3, leaseToken: () => "after-commit" });
      expect(claimedAfterCommit).toMatchObject({ id: lockedId, attempts: 1, leaseToken: "after-commit" });
      await expect(claimingStore.markDelivered(claimedAfterCommit!, now)).resolves.toBe(true);
    } finally {
      if (timeout) clearTimeout(timeout);
      allowCommit?.();
      await lockTransaction?.catch(() => undefined);
      await claimPromise?.catch(() => undefined);
      await Promise.all([lockingDatabase.close(), claimingDatabase.close()]);
    }
  });

  it("reclaims an expired lease, increments attempts, and fences its stale token", async () => {
    const id = await insertJob();
    const [original] = await store.claimDue({ now, limit: 1, leaseForMs: 1_000, maxAttempts: 3, leaseToken: () => "original" });
    const recoveryTime = new Date(now.getTime() + 1_001);
    const [reclaimed] = await store.claimDue({ now: recoveryTime, limit: 1, leaseForMs: 1_000, maxAttempts: 3, leaseToken: () => "reclaimed" });
    expect(reclaimed).toMatchObject({ id, attempts: 2, leaseToken: "reclaimed" });
    await expect(store.renewLease(original!, { now: recoveryTime, leaseForMs: 1_000 })).resolves.toBeNull();
    await expect(store.markDelivered(original!, recoveryTime)).resolves.toBe(false);
    await expect(store.markDelivered(reclaimed!, recoveryTime)).resolves.toBe(true);
  });

  it("renews, releases, delivers, reschedules, and leaves stale lease operations as no-ops", async () => {
    const releaseId = await insertJob();
    const [releaseClaim] = await store.claimDue({ now, limit: 1, leaseForMs: 1_000, maxAttempts: 3, leaseToken: () => "release" });
    const releaseAt = new Date(now.getTime() + 2_000);
    await expect(store.releaseLease({ id: releaseId, leaseToken: "stale" }, releaseAt)).resolves.toBe(false);
    await expect(store.releaseLease(releaseClaim!, releaseAt)).resolves.toBe(true);
    const [releasedAgain] = await store.claimDue({ now: releaseAt, limit: 1, leaseForMs: 1_000, maxAttempts: 3, leaseToken: () => "release-again" });
    expect(releasedAgain).toMatchObject({ id: releaseId, attempts: 2, leaseToken: "release-again" });
    await expect(store.markDelivered(releasedAgain!, releaseAt)).resolves.toBe(true);

    const deliveryId = await insertJob();
    const [deliveryClaim] = await store.claimDue({ now, limit: 1, leaseForMs: 1_000, maxAttempts: 3, leaseToken: () => "delivery" });
    const renewed = await store.renewLease(deliveryClaim!, { now: new Date(now.getTime() + 500), leaseForMs: 1_000 });
    expect(renewed).toMatchObject({ id: deliveryId, leaseToken: "delivery", attempts: 1, leaseExpiresAt: new Date(now.getTime() + 1_500) });
    await expect(store.markDelivered({ id: deliveryId, leaseToken: "stale" }, now)).resolves.toBe(false);
    await expect(store.markDelivered(renewed!, now)).resolves.toBe(true);
    await expect(store.reschedule(renewed!, { availableAt: now, failureCategory: "transient", terminal: false })).resolves.toBe(false);

    const failureId = await insertJob();
    const [failureClaim] = await store.claimDue({ now, limit: 1, leaseForMs: 1_000, maxAttempts: 3, leaseToken: () => "failure" });
    const retryAt = new Date(now.getTime() + 2_000);
    await expect(store.reschedule({ ...failureClaim!, leaseToken: "stale" }, { availableAt: retryAt, failureCategory: "transient", terminal: false })).resolves.toBe(false);
    await expect(store.reschedule(failureClaim!, { availableAt: retryAt, failureCategory: "rate_limited", terminal: false })).resolves.toBe(true);
    const [retry] = await store.claimDue({ now: retryAt, limit: 1, leaseForMs: 1_000, maxAttempts: 3, leaseToken: () => "retry" });
    expect(retry).toMatchObject({ id: failureId, attempts: 2, leaseToken: "retry" });
    await expect(store.reschedule(retry!, { availableAt: retryAt, failureCategory: "provider_rejected", terminal: true })).resolves.toBe(true);
    const [record] = await database.client`select status, attempts, failure_category, lease_token, lease_expires_at, delivered_at from public.messaging_outbox where id = ${failureId}`;
    expect(record).toMatchObject({ status: "failed", attempts: "2", failure_category: "provider_rejected", lease_token: null, lease_expires_at: null, delivered_at: null });
  });
});
