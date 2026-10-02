import type { MediaR2Deleter } from "../media/r2";
import type { MediaCleanupStore } from "./media-cleanup-store";
import { retryDelayMs } from "./dispatch-outbox";

/** Must stay well above the 15-minute upload TTL, so a signed PUT URL is dead before its upload is deleted. */
export const MEDIA_CLEANUP_GRACE_MS = 7 * 24 * 60 * 60 * 1000;

export interface MediaCleanupSummary {
  claimed: number;
  deleted: number;
  rescheduled: number;
  failed: number;
  fenced: number;
}

export interface MediaCleanupDispatcher {
  /** One bounded pass, safe for a cron invocation or ExecutionContext.waitUntil. */
  dispatchScheduled(): Promise<MediaCleanupSummary>;
}

export function createMediaCleanupDispatcher(input: {
  store: MediaCleanupStore;
  deleter: MediaR2Deleter;
  now?: () => Date;
  random?: () => number;
  createLeaseToken?: () => string;
  batchSize?: number;
  budgetMs?: number;
  graceMs?: number;
  leaseForMs?: number;
  deleteTimeoutMs?: number;
  maxAttempts?: number;
}): MediaCleanupDispatcher {
  const now = input.now ?? (() => new Date());
  const random = input.random ?? Math.random;
  const createLeaseToken = input.createLeaseToken ?? (() => crypto.randomUUID());
  const batchSize = input.batchSize ?? 25;
  const budgetMs = input.budgetMs ?? 20_000;
  const graceMs = input.graceMs ?? MEDIA_CLEANUP_GRACE_MS;
  const leaseForMs = input.leaseForMs ?? 60_000;
  const maxAttempts = input.maxAttempts ?? 8;
  // A delete that outlives its lease could be reclaimed and run twice, so keep it well inside.
  const deleteTimeoutMs = Math.max(1, Math.min(input.deleteTimeoutMs ?? 10_000, leaseForMs - Math.ceil(leaseForMs / 10)));

  return {
    async dispatchScheduled() {
      const summary: MediaCleanupSummary = { claimed: 0, deleted: 0, rescheduled: 0, failed: 0, fenced: 0 };
      const deadline = now().getTime() + budgetMs;
      // One job at a time, so a slow R2 call can't expire the lease of an unstarted batch.
      for (let remaining = batchSize; remaining > 0 && now().getTime() < deadline; remaining -= 1) {
        const [job] = await input.store.claimDue({ now: now(), limit: 1, leaseForMs, graceMs, maxAttempts, leaseToken: createLeaseToken });
        if (!job) break;
        summary.claimed += 1;
        if (await deleteWithTimeout(input.deleter, job.objectKey, deleteTimeoutMs)) {
          if (await input.store.complete(job)) summary.deleted += 1;
          else summary.fenced += 1;
          continue;
        }
        const exhausted = job.attempts >= maxAttempts;
        const availableAt = exhausted ? null : new Date(now().getTime() + retryDelayMs(job.attempts, random));
        if (!(await input.store.reschedule(job, availableAt))) summary.fenced += 1;
        else if (exhausted) summary.failed += 1;
        else summary.rescheduled += 1;
      }
      return summary;
    },
  };
}

/** False on any failure. The error is dropped because it can carry the object key. */
async function deleteWithTimeout(deleter: MediaR2Deleter, objectKey: string, timeoutMs: number): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const timeout = new Promise<false>((resolve) => { timer = setTimeout(() => resolve(false), timeoutMs); });
    return await Promise.race([deleter.delete(objectKey).then(() => true as const), timeout]);
  } catch {
    return false;
  } finally {
    if (timer) clearTimeout(timer);
  }
}
