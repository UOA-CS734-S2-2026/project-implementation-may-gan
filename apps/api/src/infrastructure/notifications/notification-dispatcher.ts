import type { DeliveryResult } from "../jobs/dispatch-outbox";
import type { GenericFcmNotificationInput } from "../push/fcm";
import { retryDelayMs } from "../jobs/dispatch-outbox";
import type { DirectMessageNotificationResolver } from "./direct-message-resolver";
import type { NotificationStore } from "./notification-store";

export interface GenericNotificationSender {
  send(input: {
    token: string;
    eventId: string;
    type: GenericFcmNotificationInput["type"];
    targetType: GenericFcmNotificationInput["targetType"];
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
  released: number;
}

export interface NotificationDispatcher {
  dispatchImmediately(): Promise<NotificationDispatchSummary>;
  dispatchScheduled(): Promise<NotificationDispatchSummary>;
}

const emptySummary = (): NotificationDispatchSummary => ({
  claimed: 0, delivered: 0, suppressed: 0, rescheduled: 0, failed: 0, fenced: 0, released: 0,
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
  scheduledBudgetMs?: number;
  leaseForMs?: number;
  deliveryTimeoutMs?: number;
  maxAttempts?: number;
  onDiagnostic?: (value: { stage: "resolve" | "send"; outcome: "timed_out" | "failed" | "suppressed" }) => void;
}): NotificationDispatcher {
  const now = input.now ?? (() => new Date());
  const random = input.random ?? Math.random;
  const createLeaseToken = input.createLeaseToken ?? (() => crypto.randomUUID());
  const immediateBudgetMs = input.immediateBudgetMs ?? 1_500;
  const immediateBatchSize = input.immediateBatchSize ?? 10;
  const scheduledBatchSize = input.scheduledBatchSize ?? 100;
  const scheduledBudgetMs = input.scheduledBudgetMs ?? 25_000;
  const leaseForMs = input.leaseForMs ?? 30_000;
  const maxAttempts = input.maxAttempts ?? 12;
  const deliveryTimeoutMs = Math.max(1, Math.min(input.deliveryTimeoutMs ?? 20_000, leaseForMs - 1_000));
  const diagnose: NonNullable<typeof input.onDiagnostic> = (value) => {
    try { input.onDiagnostic?.(value); } catch { /* Ignore diagnostic sink failures. */ }
  };

  async function dispatch(limit: number, deadline: number): Promise<NotificationDispatchSummary> {
    const summary = emptySummary();
    for (let remaining = limit; remaining > 0 && now().getTime() < deadline; remaining -= 1) {
      const [claimed] = await input.store.claimDue({ now: now(), limit: 1, leaseForMs, maxAttempts, leaseToken: createLeaseToken });
      if (!claimed) break;
      summary.claimed += 1;
      if (now().getTime() >= deadline) {
        if (await input.store.releaseLease(claimed, now())) summary.released += 1;
        else summary.fenced += 1;
        break;
      }
      const job = await input.store.renewLease(claimed, { now: now(), leaseForMs });
      if (!job) { summary.fenced += 1; continue; }

      const resolution = await resolveWithinDeadline(input.resolver, job, deadline, now);
      if (resolution.state === "timed_out" || now().getTime() >= deadline) {
        diagnose({ stage: "resolve", outcome: "timed_out" });
        if (await input.store.releaseLease(job, now())) summary.released += 1;
        else summary.fenced += 1;
        break;
      }
      if (resolution.state === "failed") {
        diagnose({ stage: "resolve", outcome: "failed" });
        const terminal = job.attempts >= maxAttempts;
        const availableAt = new Date(now().getTime() + retryDelayMs(job.attempts, random));
        if (await input.store.reschedule(job, { availableAt, failureCategory: "unknown", terminal })) {
          if (terminal) summary.failed += 1;
          else summary.rescheduled += 1;
        } else summary.fenced += 1;
        continue;
      }
      if (!resolution.notification) {
        diagnose({ stage: "resolve", outcome: "suppressed" });
        if (await input.store.markSuppressed(job, "ineligible")) summary.suppressed += 1;
        else summary.fenced += 1;
        continue;
      }

      const renewed = await input.store.renewLease(job, { now: now(), leaseForMs });
      if (!renewed) { summary.fenced += 1; continue; }
      const remainingBudgetMs = Math.max(0, deadline - now().getTime());
      if (remainingBudgetMs === 0) {
        if (await input.store.releaseLease(renewed, now())) summary.released += 1;
        else summary.fenced += 1;
        break;
      }
      const result = await sendWithTimeout(
        input.sender,
        resolution.notification,
        Math.min(deliveryTimeoutMs, remainingBudgetMs),
        diagnose,
      );
      if (result.ok) {
        if (await input.store.markDelivered(renewed, now())) summary.delivered += 1;
        else summary.fenced += 1;
        continue;
      }
      if (!result.retryable && result.category === "provider_rejected") {
        await input.resolver.invalidate(renewed, resolution.notification.registrationGeneration);
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
    dispatchScheduled: () => dispatch(scheduledBatchSize, now().getTime() + scheduledBudgetMs),
  };
}

type ResolutionOutcome =
  | { state: "resolved"; notification: Awaited<ReturnType<DirectMessageNotificationResolver["resolve"]>> }
  | { state: "failed" }
  | { state: "timed_out" };

async function resolveWithinDeadline(
  resolver: DirectMessageNotificationResolver,
  job: Parameters<DirectMessageNotificationResolver["resolve"]>[0],
  deadline: number,
  now: () => Date,
): Promise<ResolutionOutcome> {
  const controller = new AbortController();
  const remaining = Math.max(0, deadline - now().getTime());
  if (remaining === 0) return { state: "timed_out" };

  let timer: ReturnType<typeof setTimeout> | undefined;
  const operation = Promise.resolve().then(() => resolver.resolve(job, { signal: controller.signal }));
  const settled: Promise<ResolutionOutcome> = operation.then(
    (notification) => ({ state: "resolved", notification }),
    () => ({ state: "failed" }),
  );
  const timeout = new Promise<ResolutionOutcome>((resolve) => {
    timer = setTimeout(() => {
      resolve({ state: "timed_out" });
      controller.abort();
    }, remaining);
  });

  try {
    return await Promise.race([settled, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function sendWithTimeout(
  sender: GenericNotificationSender,
  notification: Awaited<ReturnType<DirectMessageNotificationResolver["resolve"]>> & {},
  timeoutMs: number,
  diagnose: (value: { stage: "send"; outcome: "timed_out" | "failed" }) => void,
): Promise<DeliveryResult> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const operation = Promise.resolve().then(() => sender.send({
    token: notification.token,
    eventId: notification.eventId,
    targetId: notification.targetId,
    title: notification.title,
    body: notification.body,
    type: notification.type ?? "direct_message",
    targetType: notification.targetType ?? "conversation",
  }, { signal: controller.signal }));
  const settled: Promise<DeliveryResult> = operation.then(
    (result) => result,
    () => {
      diagnose({ stage: "send", outcome: "failed" });
      return { ok: false, retryable: true, category: "unknown" };
    },
  );
  try {
    const timeout = new Promise<DeliveryResult>((resolve) => {
      timer = setTimeout(() => {
        diagnose({ stage: "send", outcome: "timed_out" });
        resolve({ ok: false, retryable: true, category: "transient" });
        controller.abort();
      }, timeoutMs);
    });
    return await Promise.race([settled, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
