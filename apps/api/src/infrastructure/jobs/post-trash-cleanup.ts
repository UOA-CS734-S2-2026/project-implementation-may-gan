import { sql, type DayliDatabase } from "@dayli/db";
import type { MediaR2Deleter } from "../media/r2";
import { retryDelayMs } from "./dispatch-outbox";

export type PostTrashRuntimeMode = "disabled" | "report_only" | "execute";

/** Invalid and absent configuration fail closed. Execute is intentionally opt-in. */
export function readPostTrashRuntimeMode(value: string | undefined): PostTrashRuntimeMode {
  return value === "report_only" || value === "execute" || value === "disabled" ? value : "disabled";
}

export interface PostTrashCleanupJob {
  postId: string;
  generation: number;
  leaseToken: string;
  objectKeys: string[];
}

export interface PostTrashCleanupReport { due: number; failed: number; leased: number; }

export interface PostTrashCleanupStore {
  report(): Promise<PostTrashCleanupReport>;
  claim(limit: number, leaseToken: string, leaseSeconds: number): Promise<PostTrashCleanupJob[]>;
  complete(job: Pick<PostTrashCleanupJob, "postId" | "generation" | "leaseToken">): Promise<"deleted" | "fenced" | "shared_media">;
  reschedule(job: Pick<PostTrashCleanupJob, "postId" | "generation" | "leaseToken">, delaySeconds: number | null): Promise<boolean>;
}

/** This store is for a lifecycle_worker database connection, never the app role. */
export function createPostgresPostTrashCleanupStore(database: DayliDatabase): PostTrashCleanupStore {
  return {
    async report() {
      const [row] = await database.select({
        due: sql<number>`due_count`, failed: sql<number>`failed_count`, leased: sql<number>`leased_count`,
      }).from(sql`public.report_post_trash_cleanup()`);
      // PostgreSQL count(*) is bigint and may arrive as a string in the driver.
      return { due: Number(row?.due ?? 0), failed: Number(row?.failed ?? 0), leased: Number(row?.leased ?? 0) };
    },
    async claim(limit, leaseToken, leaseSeconds) {
      const rows = await database.select({
        postId: sql<string>`post_id`, generation: sql<number>`generation`, leaseToken: sql<string>`lease_token`, objectKeys: sql<string[]>`object_keys`,
      }).from(sql`public.claim_post_trash_cleanup(${limit}, ${leaseToken}, ${leaseSeconds})`);
      return rows;
    },
    async complete(job) {
      const [row] = await database.select({ outcome: sql<"deleted" | "fenced" | "shared_media">`public.complete_post_trash_cleanup(${job.postId}, ${job.generation}, ${job.leaseToken})` })
        .from(sql`(values (1)) as cleanup_source`);
      return row?.outcome ?? "fenced";
    },
    async reschedule(job, delaySeconds) {
      const [row] = await database.select({ accepted: sql<boolean>`public.reschedule_post_trash_cleanup(${job.postId}, ${job.generation}, ${job.leaseToken}, ${delaySeconds}, 'r2_delete_failed')` })
        .from(sql`(values (1)) as cleanup_source`);
      return row?.accepted === true;
    },
  };
}

export interface PostTrashCleanupSummary { claimed: number; deleted: number; rescheduled: number; failed: number; fenced: number; report?: PostTrashCleanupReport; }
export interface PostTrashCleanupDispatcher { dispatchScheduled(): Promise<PostTrashCleanupSummary>; }

export function createPostTrashCleanupDispatcher(input: {
  mode: PostTrashRuntimeMode;
  store: PostTrashCleanupStore;
  deleter: MediaR2Deleter;
  random?: () => number;
  createLeaseToken?: () => string;
  batchSize?: number;
  leaseSeconds?: number;
  budgetMs?: number;
}): PostTrashCleanupDispatcher {
  const random = input.random ?? Math.random;
  const createLeaseToken = input.createLeaseToken ?? (() => crypto.randomUUID());
  const batchSize = Number.isInteger(input.batchSize) && input.batchSize! >= 1 && input.batchSize! <= 25
    ? input.batchSize! : 10;
  const leaseSeconds = Number.isInteger(input.leaseSeconds) && input.leaseSeconds! >= 10 && input.leaseSeconds! <= 300
    ? input.leaseSeconds! : 60;
  const budgetMs = Number.isInteger(input.budgetMs) && input.budgetMs! >= 5_000 && input.budgetMs! <= 120_000
    ? input.budgetMs! : 20_000;
  return {
    async dispatchScheduled() {
      const summary: PostTrashCleanupSummary = { claimed: 0, deleted: 0, rescheduled: 0, failed: 0, fenced: 0 };
      // Report-only reads bounded aggregate counts without acquiring a lease
      // or fetching any object keys. Disabled does nothing at all.
      if (input.mode === "report_only") return { ...summary, report: await input.store.report() };
      if (input.mode !== "execute") return summary;
      const invocationEndsAt = performance.now() + budgetMs;
      for (let remaining = batchSize; remaining > 0 && performance.now() < invocationEndsAt - 1_000; remaining -= 1) {
        // Start the budget before claiming, since the database lease begins
        // during the claim call. Leave five seconds for fenced completion.
        const leaseStartedAt = performance.now();
        const [job] = await input.store.claim(1, createLeaseToken(), leaseSeconds);
        if (!job) break;
        summary.claimed += 1;
        const stopDeletesAt = Math.min(leaseStartedAt + leaseSeconds * 1000 - 5_000, invocationEndsAt - 1_000);
        try {
          for (const objectKey of job.objectKeys) {
            const remainingMs = Math.floor(stopDeletesAt - performance.now());
            if (remainingMs < 1_000) throw new Error("Post Trash lease budget exhausted.");
            await deleteWithinLease(input.deleter, objectKey, Math.min(remainingMs, 10_000));
          }
        } catch {
          const delaySeconds = Math.ceil(retryDelayMs(1, random) / 1000);
          if (await input.store.reschedule(job, delaySeconds)) summary.rescheduled += 1;
          else summary.fenced += 1;
          continue;
        }
        const outcome = await input.store.complete(job);
        if (outcome === "deleted") summary.deleted += 1;
        else summary.fenced += 1;
      }
      return summary;
    },
  };
}

/** The production R2 adapter passes the abort signal to fetch. */
async function deleteWithinLease(deleter: MediaR2Deleter, objectKey: string, timeoutMs: number): Promise<void> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        controller.abort();
        reject(new Error("Post Trash R2 deletion timed out."));
      }, timeoutMs);
    });
    await Promise.race([deleter.delete(objectKey, controller.signal), timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
