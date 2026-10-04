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
    markDelivered: vi.fn(async () => true),
    markSuppressed: vi.fn(async () => true),
    reschedule: vi.fn(async () => true),
    ...overrides,
  };
}

const resolved = {
  token: "private-token", eventId: "event", targetId: "conversation",
  title: "Private sender", body: "Private current body",
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
      ...resolved, type: "direct_message", targetType: "conversation",
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
    }));
    expect(permanentStore.reschedule).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      failureCategory: "provider_rejected", terminal: true,
    }));
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
