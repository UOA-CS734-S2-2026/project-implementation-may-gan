import type { DeliveryResult } from "../jobs/dispatch-outbox";
import { retryDelayMs } from "../jobs/dispatch-outbox";
import type { DirectMessageNotificationResolver } from "./direct-message-resolver";
import type { NotificationStore } from "./notification-store";

export interface GenericNotificationSender {
  send(input: {
    token: string;
    eventId: string;
    type: "direct_message";
    targetType: "conversation";
    targetId: string;
    title: string;
    body: string;
  }, options?: { signal: AbortSignal }): Promise<DeliveryResult>;
}

export interface NotificationDispatchSummary {
  claimed: number;
  delivered: number;
  suppressed: number;
  rescheduled: number;
  failed: number;
  fenced: number;
}

export interface NotificationDispatcher {
  dispatchImmediately(): Promise<NotificationDispatchSummary>;
  dispatchScheduled(): Promise<NotificationDispatchSummary>;
}

const emptySummary = (): NotificationDispatchSummary => ({
  claimed: 0, delivered: 0, suppressed: 0, rescheduled: 0, failed: 0, fenced: 0,
});

export function createNotificationDispatcher(input: {
  store: NotificationStore;
  resolver: DirectMessageNotificationResolver;
  sender: GenericNotificationSender;
  now?: () => Date;
  random?: () => number;
  createLeaseToken?: () => string;
  immediateBudgetMs?: number;
  immediateBatchSize?: number;
  scheduledBatchSize?: number;
  leaseForMs?: number;
  deliveryTimeoutMs?: number;
  maxAttempts?: number;
}): NotificationDispatcher {
  const now = input.now ?? (() => new Date());
  const random = input.random ?? Math.random;
  const createLeaseToken = input.createLeaseToken ?? (() => crypto.randomUUID());
  const immediateBudgetMs = input.immediateBudgetMs ?? 1_500;
  const immediateBatchSize = input.immediateBatchSize ?? 10;
  const scheduledBatchSize = input.scheduledBatchSize ?? 100;
  const leaseForMs = input.leaseForMs ?? 30_000;
  const maxAttempts = input.maxAttempts ?? 12;
  const deliveryTimeoutMs = Math.max(1, Math.min(input.deliveryTimeoutMs ?? 20_000, leaseForMs - 1_000));

  async function dispatch(limit: number, deadline: number): Promise<NotificationDispatchSummary> {
    const summary = emptySummary();
    for (let remaining = limit; remaining > 0 && now().getTime() < deadline; remaining -= 1) {
      const [claimed] = await input.store.claimDue({ now: now(), limit: 1, leaseForMs, maxAttempts, leaseToken: createLeaseToken });
      if (!claimed) break;
      summary.claimed += 1;
      const job = await input.store.renewLease(claimed, { now: now(), leaseForMs });
      if (!job) { summary.fenced += 1; continue; }

      const resolved = await input.resolver.resolve(job);
      if (!resolved) {
        if (await input.store.markSuppressed(job, "ineligible")) summary.suppressed += 1;
        else summary.fenced += 1;
        continue;
      }

      const renewed = await input.store.renewLease(job, { now: now(), leaseForMs });
      if (!renewed) { summary.fenced += 1; continue; }
      const result = await sendWithTimeout(input.sender, resolved, deliveryTimeoutMs);
      if (result.ok) {
        if (await input.store.markDelivered(renewed, now())) summary.delivered += 1;
        else summary.fenced += 1;
        continue;
      }
      if (!result.retryable && result.category === "provider_rejected") {
        await input.resolver.invalidate(renewed);
      }
      const terminal = !result.retryable || renewed.attempts >= maxAttempts;
      const availableAt = new Date(now().getTime() + (result.retryAfterMs ?? retryDelayMs(renewed.attempts, random)));
      if (await input.store.reschedule(renewed, { availableAt, failureCategory: result.category, terminal })) {
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

async function sendWithTimeout(
  sender: GenericNotificationSender,
  notification: Awaited<ReturnType<DirectMessageNotificationResolver["resolve"]>> & {},
  timeoutMs: number,
): Promise<DeliveryResult> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const timeout = new Promise<DeliveryResult>((resolve) => {
      timer = setTimeout(() => {
        controller.abort();
        resolve({ ok: false, retryable: true, category: "transient" });
      }, timeoutMs);
    });
    return await Promise.race([
      sender.send({
        ...notification,
        type: "direct_message",
        targetType: "conversation",
      }, { signal: controller.signal }),
      timeout,
    ]);
  } catch {
    return { ok: false, retryable: true, category: "unknown" };
  } finally {
    if (timer) clearTimeout(timer);
  }
}
