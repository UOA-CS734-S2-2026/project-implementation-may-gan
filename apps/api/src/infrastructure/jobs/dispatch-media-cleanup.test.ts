import { describe, expect, it, vi } from "vitest";
import { createMediaCleanupDispatcher, MEDIA_CLEANUP_GRACE_MS } from "./dispatch-media-cleanup";
import type { MediaCleanupJob, MediaCleanupStore } from "./media-cleanup-store";

const start = new Date("2026-10-01T00:00:00.000Z");

function job(overrides: Partial<MediaCleanupJob> = {}): MediaCleanupJob {
  return { id: "r1", objectKey: "media/o/r1", attempts: 1, leaseToken: "t", leaseExpiresAt: new Date(start.getTime() + 60_000), ...overrides };
}

function storeWith(jobs: MediaCleanupJob[], overrides: Partial<MediaCleanupStore> = {}) {
  const queue = [...jobs];
  const store = {
    claimDue: vi.fn(async () => queue.splice(0, 1)),
    complete: vi.fn(async () => true),
    reschedule: vi.fn(async () => true),
    ...overrides,
  } satisfies MediaCleanupStore;
  return store;
}

describe("media cleanup dispatcher", () => {
  it("deletes the object before removing the row", async () => {
    const order: string[] = [];
    const store = storeWith([job()], { complete: vi.fn(async () => { order.push("row"); return true; }) });
    const deleter = { delete: vi.fn(async () => { order.push("object"); }) };
    const summary = await createMediaCleanupDispatcher({ store, deleter }).dispatchScheduled();
    expect(order).toEqual(["object", "row"]);
    expect(summary).toEqual({ claimed: 1, deleted: 1, rescheduled: 0, failed: 0, fenced: 0 });
  });

  it("claims with the 24 hour grace period, a bounded lease and an attempt cap", async () => {
    const store = storeWith([]);
    await createMediaCleanupDispatcher({ store, deleter: { delete: vi.fn() }, now: () => start }).dispatchScheduled();
    expect(store.claimDue).toHaveBeenCalledWith(expect.objectContaining({
      now: start, limit: 1, graceMs: MEDIA_CLEANUP_GRACE_MS, leaseForMs: 60_000, maxAttempts: 8,
    }));
    expect(MEDIA_CLEANUP_GRACE_MS).toBe(24 * 60 * 60 * 1000);
  });

  it("keeps the row and reschedules with backoff when R2 fails", async () => {
    const store = storeWith([job({ attempts: 2 })]);
    const deleter = { delete: vi.fn(async () => { throw new Error("R2 down for media/o/r1"); }) };
    const summary = await createMediaCleanupDispatcher({ store, deleter, now: () => start, random: () => 0.5 }).dispatchScheduled();
    expect(store.complete).not.toHaveBeenCalled();
    expect(store.reschedule).toHaveBeenCalledWith(expect.objectContaining({ id: "r1" }), new Date(start.getTime() + 2_000));
    expect(summary).toMatchObject({ rescheduled: 1, deleted: 0, failed: 0 });
  });

  it("counts a failure on the last attempt as failed", async () => {
    const store = storeWith([job({ attempts: 8 })]);
    const deleter = { delete: vi.fn(async () => { throw new Error("nope"); }) };
    const summary = await createMediaCleanupDispatcher({ store, deleter }).dispatchScheduled();
    expect(store.reschedule).toHaveBeenCalledWith(expect.objectContaining({ id: "r1" }), null);
    expect(summary).toMatchObject({ rescheduled: 0, failed: 1 });
  });

  it("treats a delete that outlives its timeout as a failure", async () => {
    const store = storeWith([job()]);
    const deleter = { delete: vi.fn(() => new Promise<void>(() => {})) };
    const summary = await createMediaCleanupDispatcher({ store, deleter, deleteTimeoutMs: 5 }).dispatchScheduled();
    expect(summary.rescheduled).toBe(1);
    expect(store.complete).not.toHaveBeenCalled();
  });

  it("counts a lost lease as fenced", async () => {
    const store = storeWith([job(), job({ id: "r2" })], { complete: vi.fn(async () => false), reschedule: vi.fn(async () => false) });
    const failing = { delete: vi.fn().mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error("x")) };
    const summary = await createMediaCleanupDispatcher({ store, deleter: failing }).dispatchScheduled();
    expect(summary).toEqual({ claimed: 2, deleted: 0, rescheduled: 0, failed: 0, fenced: 2 });
  });

  it("stops at the batch size and at the time budget", async () => {
    const many = Array.from({ length: 5 }, (_, index) => job({ id: `r${index}` }));
    const batched = await createMediaCleanupDispatcher({ store: storeWith(many), deleter: { delete: vi.fn() }, batchSize: 2 }).dispatchScheduled();
    expect(batched.claimed).toBe(2);

    let tick = 0;
    const clock = () => new Date(start.getTime() + tick++ * 1_000);
    const timed = await createMediaCleanupDispatcher({
      store: storeWith(Array.from({ length: 5 }, (_, index) => job({ id: `t${index}` }))),
      deleter: { delete: vi.fn() },
      now: clock,
      budgetMs: 3_000,
    }).dispatchScheduled();
    expect(timed.claimed).toBeLessThan(5);
  });
});
