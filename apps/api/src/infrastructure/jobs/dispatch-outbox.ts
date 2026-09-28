import type { FailureCategory, OutboxChannel, OutboxJob, OutboxStore } from "./outbox-store";

export type DeliveryResult =
  | { ok: true }
  | { ok: false; retryable: boolean; category: FailureCategory; retryAfterMs?: number };

/** Channel handlers must recheck their live authorization and destination state. */
export interface DeliveryOptions { signal: AbortSignal; }

export interface OutboxDeliveryHandlers {
  realtime(job: OutboxJob, options: DeliveryOptions): Promise<DeliveryResult>;
  push(job: OutboxJob, options: DeliveryOptions): Promise<DeliveryResult>;
}

export interface DispatchSummary {
  claimed: number;
  delivered: number;
  rescheduled: number;
  failed: number;
  fenced: number;
  released: number;
}

export interface OutboxDispatcher {
  /** Bounded post-commit work. Safe to pass to ExecutionContext.waitUntil. */
  dispatchImmediately(): Promise<DispatchSummary>;
  /** Cron entrypoint, which can consume more work without sharing request state. */
  dispatchScheduled(): Promise<DispatchSummary>;
}

const emptySummary = (): DispatchSummary => ({ claimed: 0, delivered: 0, rescheduled: 0, failed: 0, fenced: 0, released: 0 });

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
  /** Abort-capable provider work must finish before its lease can routinely expire. */
  deliveryTimeoutMs?: number;
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
  const deliveryTimeoutMs = Math.max(1, Math.min(input.deliveryTimeoutMs ?? 20_000, leaseForMs - Math.max(1, Math.ceil(leaseForMs / 10))));

  async function dispatch(limit: number, deadline: number): Promise<DispatchSummary> {
    const summary = emptySummary();
    let remaining = limit;
    // Claim one job at a time. A slow provider can never make an unstarted
    // batch's leases expire behind it.
    while (remaining > 0 && now().getTime() < deadline) {
      const [claimed] = await input.store.claimDue({ now: now(), limit: 1, leaseForMs, maxAttempts, leaseToken: createLeaseToken });
      if (!claimed) return summary;
      summary.claimed += 1;
      remaining -= 1;
      if (now().getTime() >= deadline) {
        if (await input.store.releaseLease(claimed, now())) summary.released += 1;
        else summary.fenced += 1;
        return summary;
      }
      // Revalidate and renew immediately before the external effect. A worker
      // that lost the lease must not call a provider at all.
      const job = await input.store.renewLease(claimed, { now: now(), leaseForMs });
      if (!job) { summary.fenced += 1; continue; }
      const heartbeat = maintainLease(input.store, job, { now, leaseForMs });
      const remainingBudget = deadline === Number.POSITIVE_INFINITY ? deliveryTimeoutMs : Math.max(1, deadline - now().getTime());
      const outcome = await deliver(input.handlers, job, Math.min(deliveryTimeoutMs, remainingBudget));
      const leaseMaintained = await heartbeat.stop();
      if (!leaseMaintained) { summary.fenced += 1; continue; }
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
    return summary;
  }

  return {
    dispatchImmediately: () => dispatch(immediateBatchSize, now().getTime() + immediateBudgetMs),
    dispatchScheduled: () => dispatch(scheduledBatchSize, Number.POSITIVE_INFINITY),
  };
}

async function deliver(handlers: OutboxDeliveryHandlers, job: OutboxJob, timeoutMs: number): Promise<DeliveryResult> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const operation = job.channel === "realtime" ? handlers.realtime(job, { signal: controller.signal }) : handlers.push(job, { signal: controller.signal });
    // Providers receive an abort signal. The race is still required to keep a
    // stuck dependency from consuming the worker's entire dispatch lifetime.
    const timeout = new Promise<DeliveryResult>((resolve) => {
      timer = setTimeout(() => { controller.abort(); resolve({ ok: false, retryable: true, category: "transient" }); }, timeoutMs);
    });
    return await Promise.race([operation, timeout]);
  } catch {
    // Do not persist provider response bodies or message data in an outbox failure.
    return { ok: false, retryable: true, category: "unknown" };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function maintainLease(store: OutboxStore, job: OutboxJob, input: { now: () => Date; leaseForMs: number }) {
  const controller = new AbortController();
  let current = job;
  let healthy = true;
  const interval = Math.max(1, Math.floor(input.leaseForMs / 3));
  const loop = (async () => {
    while (!controller.signal.aborted) {
      await waitFor(interval, controller.signal);
      if (controller.signal.aborted) return;
      try {
        const renewed = await store.renewLease(current, { now: input.now(), leaseForMs: input.leaseForMs });
        if (!renewed) { healthy = false; return; }
        current = renewed;
      } catch {
        // A renewal error is indistinguishable from a lost fence. Do not
        // acknowledge or reschedule as though this worker still owns it.
        healthy = false;
        return;
      }
    }
  })();
  return {
    async stop() {
      controller.abort();
      await loop;
      return healthy;
    },
  };
}

function waitFor(milliseconds: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(done, milliseconds);
    signal.addEventListener("abort", done, { once: true });
    function done() { clearTimeout(timer); resolve(); }
  });
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
