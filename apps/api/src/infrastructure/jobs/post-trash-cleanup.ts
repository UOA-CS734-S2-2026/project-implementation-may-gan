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

export interface PostTrashCleanupStore {
  claim(limit: number, leaseToken: string, leaseSeconds: number): Promise<PostTrashCleanupJob[]>;
  complete(job: Pick<PostTrashCleanupJob, "postId" | "generation" | "leaseToken">): Promise<"deleted" | "fenced" | "shared_media">;
  reschedule(job: Pick<PostTrashCleanupJob, "postId" | "generation" | "leaseToken">, delaySeconds: number | null): Promise<boolean>;
}

/** This store is for a lifecycle_worker database connection, never the app role. */
export function createPostgresPostTrashCleanupStore(database: DayliDatabase): PostTrashCleanupStore {
  return {
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

export interface PostTrashCleanupSummary { claimed: number; deleted: number; rescheduled: number; failed: number; fenced: number; }
export interface PostTrashCleanupDispatcher { dispatchScheduled(): Promise<PostTrashCleanupSummary>; }

export function createPostTrashCleanupDispatcher(input: {
  mode: PostTrashRuntimeMode;
  store: PostTrashCleanupStore;
  deleter: MediaR2Deleter;
  random?: () => number;
  createLeaseToken?: () => string;
  batchSize?: number;
  leaseSeconds?: number;
}): PostTrashCleanupDispatcher {
  const random = input.random ?? Math.random;
  const createLeaseToken = input.createLeaseToken ?? (() => crypto.randomUUID());
  const batchSize = input.batchSize ?? 10;
  const leaseSeconds = input.leaseSeconds ?? 60;
  return {
    async dispatchScheduled() {
      const summary: PostTrashCleanupSummary = { claimed: 0, deleted: 0, rescheduled: 0, failed: 0, fenced: 0 };
      // Report-only does not lease or mutate state. It is safe to bind before
      // execute credentials exist, while disabled does nothing at all.
      if (input.mode !== "execute") return summary;
      for (let remaining = batchSize; remaining > 0; remaining -= 1) {
        const [job] = await input.store.claim(1, createLeaseToken(), leaseSeconds);
        if (!job) break;
        summary.claimed += 1;
        try {
          for (const objectKey of job.objectKeys) await input.deleter.delete(objectKey);
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
