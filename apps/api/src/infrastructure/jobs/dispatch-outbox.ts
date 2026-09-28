import type { FailureCategory, OutboxChannel, OutboxJob, OutboxStore } from "./outbox-store";

export type DeliveryResult =
  | { ok: true }
  | { ok: false; retryable: boolean; category: FailureCategory; retryAfterMs?: number };

/** Channel handlers must recheck their live authorization and destination state. */
export interface OutboxDeliveryHandlers {
  realtime(job: OutboxJob): Promise<DeliveryResult>;
  push(job: OutboxJob): Promise<DeliveryResult>;
}

export interface DispatchSummary {
  claimed: number;
  delivered: number;
  rescheduled: number;
  failed: number;
  fenced: number;
}

export interface OutboxDispatcher {
  /** Bounded post-commit work. Safe to pass to ExecutionContext.waitUntil. */
  dispatchImmediately(): Promise<DispatchSummary>;
  /** Cron entrypoint, which can consume more work without sharing request state. */
  dispatchScheduled(): Promise<DispatchSummary>;
}

const emptySummary = (): DispatchSummary => ({ claimed: 0, delivered: 0, rescheduled: 0, failed: 0, fenced: 0 });

export function createOutboxDispatcher(input: {
  store: OutboxStore;
  handlers: OutboxDeliveryHandlers;
  now?: () => Date;
  random?: () => number;
  createLeaseToken?: () => string;
  immediateBudgetMs?: number;
  immediateBatchSize?: number;
  scheduledBatchSize?: number;
  leaseForMs?: number;
  maxAttempts?: number;
}): OutboxDispatcher {
  const now = input.now ?? (() => new Date());
  const random = input.random ?? Math.random;
  const createLeaseToken = input.createLeaseToken ?? (() => crypto.randomUUID());
  const immediateBudgetMs = input.immediateBudgetMs ?? 1_500;
  const immediateBatchSize = input.immediateBatchSize ?? 10;
  const scheduledBatchSize = input.scheduledBatchSize ?? 100;
  const leaseForMs = input.leaseForMs ?? 30_000;
  const maxAttempts = input.maxAttempts ?? 12;

  async function dispatch(limit: number, deadline: number): Promise<DispatchSummary> {
    const summary = emptySummary();
    while (now().getTime() < deadline) {
      const jobs = await input.store.claimDue({ now: now(), limit, leaseForMs, maxAttempts, leaseToken: createLeaseToken });
      summary.claimed += jobs.length;
      if (jobs.length === 0) return summary;
      for (const job of jobs) {
        if (now().getTime() >= deadline) return summary;
        const outcome = await deliver(input.handlers, job);
        if (outcome.ok) {
          if (await input.store.markDelivered(job, now())) summary.delivered += 1;
          else summary.fenced += 1;
          continue;
        }
        const terminal = !outcome.retryable || job.attempts >= maxAttempts;
        const availableAt = new Date(now().getTime() + (outcome.retryAfterMs ?? retryDelayMs(job.attempts, random)));
        if (await input.store.reschedule(job, { availableAt, failureCategory: outcome.category, terminal })) {
          if (terminal) summary.failed += 1;
          else summary.rescheduled += 1;
        } else summary.fenced += 1;
      }
      if (jobs.length < limit) return summary;
    }
    return summary;
  }

  return {
    dispatchImmediately: () => dispatch(immediateBatchSize, now().getTime() + immediateBudgetMs),
    dispatchScheduled: () => dispatch(scheduledBatchSize, Number.POSITIVE_INFINITY),
  };
}

async function deliver(handlers: OutboxDeliveryHandlers, job: OutboxJob): Promise<DeliveryResult> {
  try {
    return job.channel === "realtime" ? await handlers.realtime(job) : await handlers.push(job);
  } catch {
    // Do not persist provider response bodies or message data in an outbox failure.
    return { ok: false, retryable: true, category: "unknown" };
  }
}

/** Capped exponential backoff with bounded jitter, never a tight retry loop. */
export function retryDelayMs(attempt: number, random: () => number = Math.random): number {
  const base = Math.min(60_000, 1_000 * 2 ** Math.max(0, attempt - 1));
  return Math.round(base * (0.75 + Math.min(1, Math.max(0, random())) * 0.5));
}

export function bodyFreeRealtimeEvent(job: OutboxJob) {
  return {
    version: 1 as const,
    eventId: job.eventId,
    type: "conversation.changed" as const,
    conversationId: job.conversationId,
    changeSequence: job.changeSequence,
  };
}

export function handlerForChannel(handlers: OutboxDeliveryHandlers, channel: OutboxChannel) {
  return channel === "realtime" ? handlers.realtime : handlers.push;
}
