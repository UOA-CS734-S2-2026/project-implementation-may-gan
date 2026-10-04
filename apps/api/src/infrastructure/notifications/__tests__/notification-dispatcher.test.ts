import { describe, expect, it, vi } from "vitest";
import { createNotificationDispatcher } from "../notification-dispatcher";
import type { NotificationJob, NotificationStore } from "../notification-store";

const now = new Date("2026-10-04T00:00:00.000Z");
const job: NotificationJob = {
  id: "delivery", eventId: "event", recipientId: "recipient", deviceRegistrationId: "device",
  attempts: 1, leaseToken: "lease", leaseExpiresAt: new Date(now.getTime() + 30_000),
};

function store(overrides: Partial<NotificationStore> = {}): NotificationStore {
  return {
    claimDue: vi.fn().mockResolvedValueOnce([job]).mockResolvedValue([]),
    renewLease: vi.fn(async (claimed) => ({ ...job, ...claimed })),
    releaseLease: vi.fn(async () => true),
    markDelivered: vi.fn(async () => true),
    markSuppressed: vi.fn(async () => true),
    reschedule: vi.fn(async () => true),
    ...overrides,
  };
}

const resolved = {
  token: "private-token", eventId: "event", targetId: "conversation",
  title: "Private sender", body: "Private current body",
  registrationGeneration: { sessionId: "session", tokenHash: "generation" },
};

describe("generic notification dispatcher", () => {
  it("suppresses stale authorization without calling the provider", async () => {
    const storage = store();
    const sender = { send: vi.fn() };
    const dispatcher = createNotificationDispatcher({
      store: storage,
      resolver: { resolve: vi.fn(async () => null), invalidate: vi.fn() },
      sender,
      now: () => now,
    });
    await expect(dispatcher.dispatchScheduled()).resolves.toMatchObject({ claimed: 1, suppressed: 1 });
    expect(storage.markSuppressed).toHaveBeenCalledWith(expect.objectContaining({ id: "delivery" }), "ineligible");
    expect(sender.send).not.toHaveBeenCalled();
  });

  it("retries a resolver failure without suppressing or exposing its error", async () => {
    const storage = store();
    const sender = { send: vi.fn() };
    const dispatcher = createNotificationDispatcher({
      store: storage,
      resolver: {
        resolve: vi.fn(async () => {
          throw new Error("private-token sql-parameter private-message");
        }),
        invalidate: vi.fn(),
      },
      sender,
      now: () => now,
      random: () => 0,
    });

    await expect(dispatcher.dispatchScheduled()).resolves.toMatchObject({
      claimed: 1, rescheduled: 1, suppressed: 0,
    });
    expect(storage.markSuppressed).not.toHaveBeenCalled();
    expect(storage.reschedule).toHaveBeenCalledWith(expect.objectContaining({ id: "delivery" }), {
      availableAt: new Date(now.getTime() + 750), failureCategory: "unknown", terminal: false,
    });
    expect(sender.send).not.toHaveBeenCalled();
  });

  it("resolves current copy before provider IO and sends the versioned envelope", async () => {
    const order: string[] = [];
    const storage = store({
      renewLease: vi.fn(async (claimed) => { order.push("lease"); return { ...job, ...claimed }; }),
      markDelivered: vi.fn(async () => { order.push("delivered"); return true; }),
    });
    const resolver = { resolve: vi.fn(async () => { order.push("resolve"); return resolved; }), invalidate: vi.fn() };
    const sender = { send: vi.fn(async () => { order.push("provider"); return { ok: true as const }; }) };
    const dispatcher = createNotificationDispatcher({ store: storage, resolver, sender, now: () => now });
    await expect(dispatcher.dispatchScheduled()).resolves.toMatchObject({ delivered: 1 });
    expect(order).toEqual(["lease", "resolve", "lease", "provider", "delivered"]);
    expect(sender.send).toHaveBeenCalledWith({
      token: resolved.token,
      eventId: resolved.eventId,
      targetId: resolved.targetId,
      title: resolved.title,
      body: resolved.body,
      type: "direct_message",
      targetType: "conversation",
    }, { signal: expect.any(AbortSignal) });
  });

  it("bounds retries, sanitizes failure storage, and invalidates only the claimed owner on permanent rejection", async () => {
    const transientStore = store();
    const transient = createNotificationDispatcher({
      store: transientStore,
      resolver: { resolve: vi.fn(async () => resolved), invalidate: vi.fn() },
      sender: { send: vi.fn(async () => ({ ok: false as const, retryable: true, category: "transient" as const })) },
      now: () => now,
      random: () => 0,
    });
    await expect(transient.dispatchScheduled()).resolves.toMatchObject({ rescheduled: 1 });
    expect(transientStore.reschedule).toHaveBeenCalledWith(expect.objectContaining({ id: "delivery" }), {
      availableAt: new Date(now.getTime() + 750), failureCategory: "transient", terminal: false,
    });

    const permanentStore = store();
    const invalidate = vi.fn(async () => undefined);
    const permanent = createNotificationDispatcher({
      store: permanentStore,
      resolver: { resolve: vi.fn(async () => resolved), invalidate },
      sender: { send: vi.fn(async () => ({ ok: false as const, retryable: false, category: "provider_rejected" as const })) },
      now: () => now,
    });
    await expect(permanent.dispatchScheduled()).resolves.toMatchObject({ failed: 1 });
    expect(invalidate).toHaveBeenCalledWith(expect.objectContaining({
      deviceRegistrationId: "device", recipientId: "recipient",
    }), resolved.registrationGeneration);
    expect(permanentStore.reschedule).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      failureCategory: "provider_rejected", terminal: true,
    }));
  });

  it("releases claimed work without provider IO when resolution exhausts the immediate budget", async () => {
    const clock = { value: now };
    const storage = store();
    const sender = { send: vi.fn() };
    const resolver = {
      resolve: vi.fn(async () => {
        clock.value = new Date(now.getTime() + 1_500);
        return resolved;
      }),
      invalidate: vi.fn(),
    };
    const dispatcher = createNotificationDispatcher({
      store: storage,
      resolver,
      sender,
      now: () => clock.value,
      immediateBudgetMs: 1_500,
    });
    await expect(dispatcher.dispatchImmediately()).resolves.toMatchObject({ claimed: 1, released: 1 });
    expect(storage.releaseLease).toHaveBeenCalledWith(expect.objectContaining({ id: "delivery" }), clock.value);
    expect(sender.send).not.toHaveBeenCalled();
  });

  it.each(["resolve", "reject"] as const)(
    "returns within budget when resolution ignores abort, then safely ignores a late %s",
    async (lateSettlement) => {
      vi.useFakeTimers();
      try {
        const storage = store();
        const sender = { send: vi.fn() };
        let resolveOperation: ((value: typeof resolved) => void) | undefined;
        let rejectOperation: ((reason: unknown) => void) | undefined;
        let resolutionSignal: AbortSignal | undefined;
        const operation = new Promise<typeof resolved>((resolve, reject) => {
          resolveOperation = resolve;
          rejectOperation = reject;
        });
        const resolver = {
          resolve: vi.fn((_job: unknown, options?: { signal: AbortSignal }) => {
            resolutionSignal = options?.signal;
            return operation;
          }),
          invalidate: vi.fn(),
        };
        const dispatcher = createNotificationDispatcher({
          store: storage,
          resolver,
          sender,
          now: () => now,
          immediateBudgetMs: 1_500,
        });

        const pending = dispatcher.dispatchImmediately();
        await vi.advanceTimersByTimeAsync(1_500);
        await expect(pending).resolves.toMatchObject({ claimed: 1, released: 1 });
        expect(resolutionSignal?.aborted).toBe(true);
        expect(sender.send).not.toHaveBeenCalled();

        const releaseCalls = vi.mocked(storage.releaseLease).mock.calls.length;
        if (lateSettlement === "resolve") resolveOperation?.(resolved);
        else rejectOperation?.(new Error("private-token sql-parameter private-message"));
        await Promise.resolve();
        await Promise.resolve();

        expect(sender.send).not.toHaveBeenCalled();
        expect(storage.markDelivered).not.toHaveBeenCalled();
        expect(storage.markSuppressed).not.toHaveBeenCalled();
        expect(storage.reschedule).not.toHaveBeenCalled();
        expect(storage.releaseLease).toHaveBeenCalledTimes(releaseCalls);
        expect(vi.getTimerCount()).toBe(0);
      } finally {
        vi.useRealTimers();
      }
    },
  );

  it("limits provider work to the remaining budget and waits for abort cleanup", async () => {
    vi.useFakeTimers();
    try {
      const clock = { value: now };
      const storage = store();
      let cleanedUp = false;
      const sender = { send: vi.fn((_payload: unknown, options?: { signal: AbortSignal }) => new Promise<{
        ok: false;
        retryable: true;
        category: "transient";
      }>((resolve) => {
        options?.signal.addEventListener("abort", () => {
          cleanedUp = true;
          resolve({ ok: false, retryable: true, category: "transient" });
        }, { once: true });
      })) };
      const resolver = {
        resolve: vi.fn(async () => {
          clock.value = new Date(now.getTime() + 1_400);
          return resolved;
        }),
        invalidate: vi.fn(),
      };
      const dispatcher = createNotificationDispatcher({
        store: storage,
        resolver,
        sender,
        now: () => clock.value,
        immediateBudgetMs: 1_500,
        deliveryTimeoutMs: 20_000,
      });
      const pending = dispatcher.dispatchImmediately();
      await vi.advanceTimersByTimeAsync(100);
      await expect(pending).resolves.toMatchObject({ rescheduled: 1 });
      expect(cleanedUp).toBe(true);
      expect(storage.reschedule).toHaveBeenCalledOnce();
    } finally {
      vi.useRealTimers();
    }
  });

  it("returns within budget when provider work ignores abort", async () => {
    vi.useFakeTimers();
    try {
      const storage = store();
      let providerSignal: AbortSignal | undefined;
      const sender = {
        send: vi.fn((_payload: unknown, options?: { signal: AbortSignal }) => {
          providerSignal = options?.signal;
          return new Promise<never>(() => undefined);
        }),
      };
      const dispatcher = createNotificationDispatcher({
        store: storage,
        resolver: { resolve: vi.fn(async () => resolved), invalidate: vi.fn() },
        sender,
        now: () => now,
        immediateBudgetMs: 1_500,
        deliveryTimeoutMs: 20_000,
      });

      const pending = dispatcher.dispatchImmediately();
      await vi.advanceTimersByTimeAsync(1_500);
      await expect(pending).resolves.toMatchObject({ claimed: 1, rescheduled: 1 });
      expect(providerSignal?.aborted).toBe(true);
      expect(storage.reschedule).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
        failureCategory: "transient", terminal: false,
      }));
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not call the provider after losing the lease fence", async () => {
    const storage = store({ renewLease: vi.fn(async () => null) });
    const sender = { send: vi.fn() };
    const dispatcher = createNotificationDispatcher({
      store: storage,
      resolver: { resolve: vi.fn(async () => resolved), invalidate: vi.fn() },
      sender,
      now: () => now,
    });
    await expect(dispatcher.dispatchScheduled()).resolves.toMatchObject({ fenced: 1, delivered: 0 });
    expect(sender.send).not.toHaveBeenCalled();
  });
});
