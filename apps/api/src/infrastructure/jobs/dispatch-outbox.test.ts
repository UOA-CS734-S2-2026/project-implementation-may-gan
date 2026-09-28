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
    claimDue: vi.fn(async () => jobs.splice(0)),
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

  it("uses capped jittered exponential retry delays", () => {
    expect(retryDelayMs(1, () => 0)).toBe(750);
    expect(retryDelayMs(20, () => 1)).toBe(75_000);
  });
});
