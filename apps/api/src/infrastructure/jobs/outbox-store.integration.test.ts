import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { createDayliDatabase, type DayliDatabase } from "@dayli/db";
import { createPostgresOutboxStore } from "./outbox-store";

const connectionString = process.env.MESSAGING_DELIVERY_TEST_DATABASE_URL ?? process.env.MESSAGING_TEST_DATABASE_URL;
const target = connectionString ? new URL(connectionString) : undefined;
if (target?.hostname === "localhost" && target.port === "5433" && target.pathname !== "/dayli_messaging_test") {
  throw new Error("Outbox leasing integration tests must use the isolated dayli_messaging_test database.");
}
const suite = connectionString ? describe : describe.skip;

function defer(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void;
  return { promise: new Promise<void>((done) => { resolve = done; }), resolve };
}

/** Pauses the first transaction's UPDATE after its preceding SELECT has returned. */
function pauseFirstUpdate(database: DayliDatabase, gate: Promise<void>, signal: () => void): DayliDatabase {
  let shouldPause = true;
  return new Proxy(database, {
    get(target, property, receiver) {
      const value = Reflect.get(target, property, receiver);
      if (property !== "transaction" || typeof value !== "function") return value;
      return (callback: (transaction: object) => Promise<unknown>, ...args: unknown[]) => value.call(
        target,
        (transaction: object) => callback(new Proxy(transaction, {
          get(transactionTarget, transactionProperty, transactionReceiver) {
            const transactionValue = Reflect.get(transactionTarget, transactionProperty, transactionReceiver);
            if (transactionProperty !== "update" || typeof transactionValue !== "function") return transactionValue;
            const wrapUpdate = (update: object): object => new Proxy(update, {
              get(updateTarget, updateProperty, updateReceiver) {
                const updateValue = Reflect.get(updateTarget, updateProperty, updateReceiver);
                if (updateProperty === "returning" && typeof updateValue === "function" && shouldPause) {
                  return (...returningArgs: unknown[]) => {
                    shouldPause = false;
                    signal();
                    return gate.then(() => updateValue.apply(updateTarget, returningArgs));
                  };
                }
                if ((updateProperty === "set" || updateProperty === "where") && typeof updateValue === "function") {
                  return (...updateArgs: unknown[]) => wrapUpdate(updateValue.apply(updateTarget, updateArgs));
                }
                return updateValue;
              },
            });
            return (...updateArgs: unknown[]) => wrapUpdate(transactionValue.apply(transactionTarget, updateArgs));
          },
        })),
        ...args,
      );
    },
  });
}

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

  async function insertJob(id = `delivery-j-${crypto.randomUUID()}`, availableAt = now, changeSequence = "1"): Promise<string> {
    await database.client`insert into public.messaging_outbox (id, event_id, recipient_id, conversation_id, change_sequence, channel, status, attempts, available_at, created_at) values (${id}, ${crypto.randomUUID()}, ${ids.high}, ${ids.conversation}, ${changeSequence}, 'realtime', 'pending', 0, ${availableAt.toISOString()}, ${nowIso})`;
    jobIds.push(id);
    return id;
  }

  beforeAll(async () => {
    await database.client`insert into public."user" (id, name, email) values (${ids.low}, ${ids.low}, ${ids.low + "@example.test"}), (${ids.high}, ${ids.high}, ${ids.high + "@example.test"})`;
    await database.client`insert into public.conversations (id, kind, participant_low_id, participant_high_id, initiator_participant_id, request_state, last_message_sequence, last_change_sequence, last_activity_at, created_at, updated_at) values (${ids.conversation}, 'direct', ${ids.low}, ${ids.high}, ${ids.low}, 'active', 0, 0, ${nowIso}, ${nowIso}, ${nowIso})`;
  });

  afterEach(async () => {
    await database.client`delete from public.messaging_outbox where id = any(${jobIds.splice(0)}::text[])`;
  });

  afterAll(async () => {
    try {
      await database.client`delete from public."user" where id = any(${[ids.low, ids.high]}::text[])`;
    } finally { await database.close(); }
  });

  it("retains a selected row lock until the claim update executes", async () => {
    const id = await insertJob(`delivery-claim-lock-${crypto.randomUUID()}`);
    const firstDatabase = createDayliDatabase(connectionString!);
    const secondDatabase = createDayliDatabase(connectionString!);
    const updateGate = defer();
    const updateQueued = defer();
    const firstStore = createPostgresOutboxStore(pauseFirstUpdate(firstDatabase.db, updateGate.promise, updateQueued.resolve));
    const secondStore = createPostgresOutboxStore(secondDatabase.db);
    let timeout: ReturnType<typeof setTimeout> | undefined;
    let firstClaim: Promise<Awaited<ReturnType<typeof firstStore.claimDue>>> | undefined;

    try {
      firstClaim = firstStore.claimDue({ now, limit: 1, leaseForMs: 1_000, maxAttempts: 3, leaseToken: () => "first" });
      await Promise.race([
        updateQueued.promise,
        new Promise<never>((_, reject) => {
          timeout = setTimeout(() => reject(new Error("The first claim did not reach its update.")), 5_000);
        }),
      ]);
      if (timeout) clearTimeout(timeout);
      timeout = undefined;

      const secondClaim = await Promise.race([
        secondStore.claimDue({ now, limit: 1, leaseForMs: 1_000, maxAttempts: 3, leaseToken: () => "second" }),
        new Promise<never>((_, reject) => {
          timeout = setTimeout(() => reject(new Error("The second claim did not skip the selected row.")), 5_000);
        }),
      ]);
      expect(secondClaim).toEqual([]);
      if (timeout) clearTimeout(timeout);
      timeout = undefined;

      updateGate.resolve();
      await expect(firstClaim).resolves.toMatchObject([{ id, leaseToken: "first" }]);
    } finally {
      if (timeout) clearTimeout(timeout);
      updateGate.resolve();
      await firstClaim?.catch(() => undefined);
      await Promise.all([firstDatabase.close(), secondDatabase.close()]);
    }
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

  it("preserves bigint change sequences beyond Number.MAX_SAFE_INTEGER", async () => {
    const changeSequence = "9007199254740993";
    const id = await insertJob(undefined, now, changeSequence);
    const [claimed] = await store.claimDue({ now, limit: 1, leaseForMs: 1_000, maxAttempts: 3, leaseToken: () => "precise" });
    expect(claimed).toMatchObject({ id });
    expect(claimed?.changeSequence).toBe(changeSequence);

    const renewed = await store.renewLease(claimed!, { now: new Date(now.getTime() + 500), leaseForMs: 1_000 });
    expect(renewed).toMatchObject({ id, leaseToken: "precise" });
    expect(renewed?.changeSequence).toBe(changeSequence);
    await expect(store.markDelivered(renewed!, now)).resolves.toBe(true);
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
