import { describe, expect, it, vi } from "vitest";
import { bodyFreeRealtimeEvent, createOutboxDispatcher, retryDelayMs } from "./dispatch-outbox";
import type { OutboxJob, OutboxStore } from "./outbox-store";

const job = (overrides: Partial<OutboxJob> = {}): OutboxJob => ({
  id: "job", eventId: "event", recipientId: "recipient", conversationId: "conversation",
  changeSequence: "3", channel: "realtime", deviceRegistrationId: null, attempts: 1,
  leaseToken: "lease", leaseExpiresAt: new Date("2026-09-28T00:01:00.000Z"), ...overrides,
});

function store(jobs: OutboxJob[]): OutboxStore {
  return {
    claimDue: vi.fn(async () => jobs.splice(0, 1)),
    renewLease: vi.fn(async (job: OutboxJob) => job),
    releaseLease: vi.fn(async () => true),
    markDelivered: vi.fn(async () => true),
    reschedule: vi.fn(async () => true),
  };
}

describe("outbox dispatcher", () => {
  it("publishes a body-free realtime invalidation and acknowledges only its lease", async () => {
    const outbox = store([job()]);
    const realtime = vi.fn(async (claimed: OutboxJob) => {
      expect(bodyFreeRealtimeEvent(claimed)).toEqual({ version: 1, eventId: "event", type: "conversation.changed", conversationId: "conversation", changeSequence: "3" });
      return { ok: true as const };
    });
    const dispatcher = createOutboxDispatcher({ store: outbox, handlers: { realtime, push: vi.fn() }, immediateBudgetMs: 100, now: () => new Date("2026-09-28T00:00:00.000Z") });
    await expect(dispatcher.dispatchImmediately()).resolves.toMatchObject({ claimed: 1, delivered: 1 });
    expect(outbox.markDelivered).toHaveBeenCalledWith(expect.objectContaining({ id: "job", leaseToken: "lease" }), expect.any(Date));
  });

  it("reschedules transient delivery failure with a safe category and bounded backoff", async () => {
    const outbox = store([job({ attempts: 2 })]);
    const dispatcher = createOutboxDispatcher({
      store: outbox, handlers: { realtime: async () => ({ ok: false, retryable: true, category: "transient" }), push: vi.fn() },
      immediateBudgetMs: 100, now: () => new Date("2026-09-28T00:00:00.000Z"), random: () => 0,
    });
    await expect(dispatcher.dispatchImmediately()).resolves.toMatchObject({ rescheduled: 1, failed: 0 });
    expect(outbox.reschedule).toHaveBeenCalledWith(expect.objectContaining({ leaseToken: "lease" }), expect.objectContaining({ terminal: false, failureCategory: "transient", availableAt: new Date("2026-09-28T00:00:01.500Z") }));
  });

  it("does not let an expired lease acknowledge work reclaimed by another worker", async () => {
    const outbox = store([job()]);
    (outbox.markDelivered as ReturnType<typeof vi.fn>).mockResolvedValue(false);
    const dispatcher = createOutboxDispatcher({ store: outbox, handlers: { realtime: async () => ({ ok: true }), push: vi.fn() }, immediateBudgetMs: 100, now: () => new Date("2026-09-28T00:00:00.000Z") });
    await expect(dispatcher.dispatchImmediately()).resolves.toMatchObject({ delivered: 0, fenced: 1 });
  });

  it("marks permanent provider rejection terminally without retrying", async () => {
    const outbox = store([job({ channel: "push" })]);
    const push = vi.fn(async () => ({ ok: false as const, retryable: false, category: "provider_rejected" as const }));
    const dispatcher = createOutboxDispatcher({ store: outbox, handlers: { realtime: vi.fn(), push }, immediateBudgetMs: 100, now: () => new Date("2026-09-28T00:00:00.000Z") });
    await expect(dispatcher.dispatchImmediately()).resolves.toMatchObject({ failed: 1, rescheduled: 0 });
    expect(outbox.reschedule).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ terminal: true, failureCategory: "provider_rejected" }));
  });

  it("never calls a provider after a lease is reclaimed before delivery", async () => {
    const outbox = store([job()]);
    (outbox.renewLease as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const realtime = vi.fn(async () => ({ ok: true as const }));
    const dispatcher = createOutboxDispatcher({ store: outbox, handlers: { realtime, push: vi.fn() }, immediateBudgetMs: 100, now: () => new Date("2026-09-28T00:00:00.000Z") });
    await expect(dispatcher.dispatchImmediately()).resolves.toMatchObject({ fenced: 1, delivered: 0 });
    expect(realtime).not.toHaveBeenCalled();
  });

  it("claims one job at a time so a competing worker cannot reclaim an unstarted batch", async () => {
    const jobs = [job({ id: "first" }), job({ id: "second" })];
    const outbox = store(jobs);
    const clock = { value: new Date("2026-09-28T00:00:00.000Z") };
    const firstDelivery = vi.fn(async () => { clock.value = new Date(clock.value.getTime() + 31_000); return { ok: true as const }; });
    const dispatcher = createOutboxDispatcher({ store: outbox, handlers: { realtime: firstDelivery, push: vi.fn() }, scheduledBatchSize: 2, leaseForMs: 30_000, now: () => clock.value });
    await dispatcher.dispatchScheduled();
    expect(outbox.claimDue).toHaveBeenNthCalledWith(1, expect.objectContaining({ limit: 1 }));
    expect(outbox.claimDue).toHaveBeenNthCalledWith(2, expect.objectContaining({ limit: 1 }));
    expect(firstDelivery).toHaveBeenCalledTimes(2);
  });

  it("aborts a stalled provider before the owned lease can expire", async () => {
    const outbox = store([job()]);
    let aborted = false;
    const realtime = vi.fn(async (_job: OutboxJob, options: { signal: AbortSignal }) => {
      await new Promise<void>((resolve) => options.signal.addEventListener("abort", () => { aborted = true; resolve(); }, { once: true }));
      return { ok: false as const, retryable: true, category: "transient" as const };
    });
    const dispatcher = createOutboxDispatcher({ store: outbox, handlers: { realtime, push: vi.fn() }, immediateBudgetMs: 100, deliveryTimeoutMs: 1, leaseForMs: 20, now: () => new Date("2026-09-28T00:00:00.000Z") });
    await expect(dispatcher.dispatchImmediately()).resolves.toMatchObject({ rescheduled: 1 });
    expect(aborted).toBe(true);
  });

  it("aborts a blocked provider when lease renewal loses ownership", async () => {
    const outbox = store([job()]);
    (outbox.renewLease as ReturnType<typeof vi.fn>).mockResolvedValueOnce(job()).mockResolvedValueOnce(null);
    let observedAbort = false;
    let sent = false;
    const realtime = vi.fn(async (_job: OutboxJob, options: { signal: AbortSignal }) => {
      await new Promise<void>((resolve) => options.signal.addEventListener("abort", () => { observedAbort = true; resolve(); }, { once: true }));
      sent = !options.signal.aborted;
      return { ok: true as const };
    });
    const dispatcher = createOutboxDispatcher({ store: outbox, handlers: { realtime, push: vi.fn() }, immediateBudgetMs: 100, leaseForMs: 30, deliveryTimeoutMs: 25, now: () => new Date("2026-09-28T00:00:00.000Z") });
    await expect(dispatcher.dispatchImmediately()).resolves.toMatchObject({ fenced: 1, delivered: 0 });
    expect(observedAbort).toBe(true);
    expect(sent).toBe(false);
    expect(outbox.markDelivered).not.toHaveBeenCalled();
  });

  it("uses capped jittered exponential retry delays", () => {
    expect(retryDelayMs(1, () => 0)).toBe(750);
    expect(retryDelayMs(20, () => 1)).toBe(75_000);
  });
});
