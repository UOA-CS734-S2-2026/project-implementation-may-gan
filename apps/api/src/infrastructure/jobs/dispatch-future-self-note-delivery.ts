import type { AucklandDayService, ClockLike } from "@dayli/domain";
import type { FutureSelfNoteDeliveryStore } from "./future-self-note-delivery-store";

/** Counts only. A summary never carries note IDs, owners, text, or errors. */
export interface FutureSelfNoteDeliverySummary {
  claimed: number;
  delivered: number;
  discarded: number;
  fenced: number;
}

export interface FutureSelfNoteDeliveryDispatcher {
  /** One bounded pass, safe for a cron invocation or ExecutionContext.waitUntil, and safe to run twice or concurrently. */
  dispatchScheduled(): Promise<FutureSelfNoteDeliverySummary>;
}

function readNow(clock: ClockLike): Date {
  const now = typeof clock === "function" ? clock() : clock.now();
  if (!(now instanceof Date) || Number.isNaN(now.getTime())) throw new TypeError("The clock must return a valid Date.");
  return new Date(now.getTime());
}

/**
 * Delivers every scheduled note whose Auckland date has arrived: claim a
 * reminder, then record the delivery, dropping the reminder when the note, its
 * owner, or its schedule no longer allows it. This records state only. It sends
 * no push notification, which is a separate feature.
 */
export function createFutureSelfNoteDeliveryDispatcher(input: {
  store: FutureSelfNoteDeliveryStore;
  clock: ClockLike;
  dayService: AucklandDayService;
  createLeaseToken?: () => string;
  generateId?: () => string;
  batchSize?: number;
  budgetMs?: number;
  leaseForMs?: number;
}): FutureSelfNoteDeliveryDispatcher {
  const createLeaseToken = input.createLeaseToken ?? (() => crypto.randomUUID());
  const generateId = input.generateId ?? (() => crypto.randomUUID());
  const batchSize = input.batchSize ?? 25;
  const budgetMs = input.budgetMs ?? 20_000;
  const leaseForMs = input.leaseForMs ?? 60_000;

  return {
    async dispatchScheduled() {
      const summary: FutureSelfNoteDeliverySummary = { claimed: 0, delivered: 0, discarded: 0, fenced: 0 };
      const deadline = readNow(input.clock).getTime() + budgetMs;
      do {
        const claimedAt = readNow(input.clock);
        const claims = await input.store.claimDue({
          today: input.dayService.forInstant(claimedAt).localDate,
          now: claimedAt,
          limit: batchSize,
          leaseForMs,
          leaseToken: createLeaseToken,
          generateId,
        });
        for (const claim of claims) {
          summary.claimed += 1;
          // Time and the Auckland date are read again, so a reminder held across midnight is judged when it completes.
          const completedAt = readNow(input.clock);
          const result = await input.store.complete(claim, {
            today: input.dayService.forInstant(completedAt).localDate,
            now: completedAt,
          });
          if (result.outcome === "delivered") summary.delivered += 1;
          else if (result.outcome === "discarded") summary.discarded += 1;
          else summary.fenced += 1;
        }
        if (claims.length < batchSize) break;
      } while (readNow(input.clock).getTime() < deadline);
      return summary;
    },
  };
}
