import { createAucklandDayService } from "@dayli/domain";
import { describe, expect, it, vi } from "vitest";
import { createFutureSelfNoteDeliveryDispatcher } from "../dispatch-future-self-note-delivery";
import type { FutureSelfNoteDeliveryClaim, FutureSelfNoteDeliveryResult, FutureSelfNoteDeliveryStore } from "../future-self-note-delivery-store";

// 00:30 on 11 October 2026 in Auckland, still 10 October in UTC.
const start = new Date("2026-10-10T11:30:00.000Z");

function claim(id: string): FutureSelfNoteDeliveryClaim {
  return { id: `delivery-${id}`, noteId: `note-${id}`, scheduleVersion: 1, leaseToken: `token-${id}` };
}

function setup(batches: FutureSelfNoteDeliveryClaim[][], results: FutureSelfNoteDeliveryResult[] = []) {
  const clock = { now: () => start };
  const queue = [...batches];
  const outcomes = [...results];
  const store = {
    claimDue: vi.fn(async () => queue.shift() ?? []),
    complete: vi.fn(async () => outcomes.shift() ?? { outcome: "delivered" as const }),
  } satisfies FutureSelfNoteDeliveryStore;
  return {
    store,
    dispatcher: createFutureSelfNoteDeliveryDispatcher({ store, clock, dayService: createAucklandDayService(clock), batchSize: 2 }),
  };
}

describe("future-self note delivery dispatcher", () => {
  it("claims with the Auckland date and a bounded lease, then completes each claim", async () => {
    const { store, dispatcher } = setup([[claim("a")]]);

    const summary = await dispatcher.dispatchScheduled();

    expect(store.claimDue).toHaveBeenCalledWith(expect.objectContaining({ today: "2026-10-11", now: start, limit: 2, leaseForMs: 60_000 }));
    expect(store.complete).toHaveBeenCalledWith(claim("a"), { today: "2026-10-11", now: start });
    expect(summary).toEqual({ claimed: 1, delivered: 1, discarded: 0, fenced: 0 });
  });

  it("counts discarded and fenced reminders separately from deliveries", async () => {
    const { dispatcher } = setup(
      [[claim("a"), claim("b")], [claim("c")]],
      [{ outcome: "delivered" }, { outcome: "discarded", reason: "rescheduled" }, { outcome: "fenced" }],
    );

    expect(await dispatcher.dispatchScheduled()).toEqual({ claimed: 3, delivered: 1, discarded: 1, fenced: 1 });
  });

  it("keeps claiming while batches come back full, and stops at a short batch", async () => {
    const { store, dispatcher } = setup([[claim("a"), claim("b")], [claim("c"), claim("d")], [claim("e")]]);

    await dispatcher.dispatchScheduled();

    expect(store.claimDue).toHaveBeenCalledTimes(3);
  });

  it("does nothing when no note is due", async () => {
    const { store, dispatcher } = setup([]);

    expect(await dispatcher.dispatchScheduled()).toEqual({ claimed: 0, delivered: 0, discarded: 0, fenced: 0 });
    expect(store.complete).not.toHaveBeenCalled();
  });

  it("stops at its time budget", async () => {
    let current = start.getTime();
    const clock = { now: () => new Date(current) };
    const store = {
      claimDue: vi.fn(async () => { current += 30_000; return [claim("a"), claim("b")]; }),
      complete: vi.fn(async () => ({ outcome: "delivered" as const })),
    } satisfies FutureSelfNoteDeliveryStore;
    const dispatcher = createFutureSelfNoteDeliveryDispatcher({
      store, clock, dayService: createAucklandDayService(clock), batchSize: 2, budgetMs: 20_000,
    });

    await dispatcher.dispatchScheduled();

    expect(store.claimDue).toHaveBeenCalledTimes(1);
  });
});
