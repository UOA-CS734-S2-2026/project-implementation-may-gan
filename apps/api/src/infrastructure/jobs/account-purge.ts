import { sql, type DayliDatabase } from "@dayli/db";
import type { MediaR2Deleter } from "../media/r2";
import type { ExportArchiveStore } from "../../features/data-export/shared/export-r2-archive";
import { retryDelayMs } from "./dispatch-outbox";

export type AccountPurgeRuntimeMode = "disabled" | "report_only" | "execute";

export interface AccountPurgeReport {
  due: number;
  failed: number;
  terminalFailed: number;
  leased: number;
  paused: boolean;
  controlPresent: boolean;
  controlFresh: boolean;
  terminalCleanup: number;
  drainState: "active" | "draining" | "paused" | "incident";
  operatorEpoch: number;
  startedOperations: number;
  unresolvedOperations: number;
  safeToResume: boolean;
  externalProviderQuiescenceClaimed: boolean;
  drainUpdatedAt: Date | null;
  oldestStartedAt: Date | null;
}
export function accountPurgeControlUnavailable(report: AccountPurgeReport): boolean {
  return !report.controlPresent || (!report.paused && !report.controlFresh);
}

export function accountPurgeProviderIncident(report: AccountPurgeReport, now = new Date()): boolean {
  if (report.drainState === "incident" || report.unresolvedOperations > 0) return true;
  return report.drainState === "draining" && report.startedOperations > 0
    && (!report.oldestStartedAt || now.getTime() - report.oldestStartedAt.getTime() >= 3 * 60_000);
}

export interface AccountPurgeCleanupJob {
  taskId: string;
  ownerId: string;
  lifecycleGeneration: number;
  objectKey: string;
  exportCleanupTaskId: string | null;
  exportUploadId: string | null;
  leaseToken: string;
}

export interface AccountPurgeStore {
  report(): Promise<AccountPurgeReport>;
  pruneExpiredReceipts(limit: number): Promise<number>;
  claim(limit: number, leaseToken: string, leaseSeconds: number): Promise<AccountPurgeCleanupJob[]>;
  authorize(job: Pick<AccountPurgeCleanupJob, "taskId" | "lifecycleGeneration" | "leaseToken">): Promise<boolean>;
  complete(job: Pick<AccountPurgeCleanupJob, "taskId" | "lifecycleGeneration" | "leaseToken">): Promise<boolean>;
  retry(job: Pick<AccountPurgeCleanupJob, "taskId" | "lifecycleGeneration" | "leaseToken">, delaySeconds: number): Promise<boolean>;
}

/** The lifecycle_worker can use only these fenced procedures, never table DML. */
export function createAccountPurgeStore(database: DayliDatabase): AccountPurgeStore {
  return {
    async report() {
      const [row] = await database.select({
        due: sql<number>`due_count`, failed: sql<number>`failed_count`, terminalFailed: sql<number>`terminal_failed_count`, leased: sql<number>`leased_count`,
        paused: sql<boolean>`paused`, controlPresent: sql<boolean>`control_present`,
        controlFresh: sql<boolean>`control_fresh`, terminalCleanup: sql<number>`terminal_cleanup_count`,
        drainState: sql<AccountPurgeReport["drainState"]>`drain_state`, operatorEpoch: sql<number>`operator_epoch`,
        startedOperations: sql<number>`started_operation_count`, unresolvedOperations: sql<number>`unresolved_operation_count`,
        safeToResume: sql<boolean>`safe_to_resume`,
        externalProviderQuiescenceClaimed: sql<boolean>`external_provider_quiescence_claimed`,
        drainUpdatedAt: sql<Date | null>`drain_updated_at`, oldestStartedAt: sql<Date | null>`oldest_started_at`,
      }).from(sql`public.report_account_purge_cleanup()`)
        .crossJoin(sql`public.report_account_purge_operator_control()`);
      return {
        due: Number(row?.due ?? 0), failed: Number(row?.failed ?? 0), terminalFailed: Number(row?.terminalFailed ?? 0), leased: Number(row?.leased ?? 0),
        paused: row?.paused !== false, controlPresent: row?.controlPresent === true,
        controlFresh: row?.controlFresh === true, terminalCleanup: Number(row?.terminalCleanup ?? 0),
        drainState: row?.drainState ?? "incident", operatorEpoch: Number(row?.operatorEpoch ?? 0),
        startedOperations: Number(row?.startedOperations ?? 0),
        unresolvedOperations: Number(row?.unresolvedOperations ?? 0), safeToResume: row?.safeToResume === true,
        externalProviderQuiescenceClaimed: row?.externalProviderQuiescenceClaimed === true,
        drainUpdatedAt: row?.drainUpdatedAt ?? null, oldestStartedAt: row?.oldestStartedAt ?? null,
      };
    },
    async pruneExpiredReceipts(limit) {
      const [row] = await database.select({ deleted: sql<number>`public.delete_expired_account_purge_receipts(${limit})` })
        .from(sql`(values (1)) as purge_source`);
      return Number(row?.deleted ?? 0);
    },
    async claim(limit, leaseToken, leaseSeconds) {
      return database.select({
        taskId: sql<string>`task_id`, ownerId: sql<string>`owner_id`, lifecycleGeneration: sql<number>`lifecycle_generation`,
        objectKey: sql<string>`object_key`, exportCleanupTaskId: sql<string | null>`export_cleanup_task_id`,
        exportUploadId: sql<string | null>`export_upload_id`, leaseToken: sql<string>`lease_token`,
      }).from(sql`public.claim_account_purge_cleanup(${limit}, ${leaseToken}, ${leaseSeconds})`);
    },
    async authorize(job) {
      const [row] = await database.select({ authorized: sql<boolean>`public.authorize_account_purge_cleanup(${job.taskId}, ${job.lifecycleGeneration}, ${job.leaseToken})` })
        .from(sql`(values (1)) as purge_source`);
      return row?.authorized === true;
    },
    async complete(job) {
      const [row] = await database.select({ completed: sql<boolean>`public.complete_account_purge_cleanup(${job.taskId}, ${job.lifecycleGeneration}, ${job.leaseToken})` })
        .from(sql`(values (1)) as purge_source`);
      return row?.completed === true;
    },
    async retry(job, delaySeconds) {
      const [row] = await database.select({ accepted: sql<boolean>`public.retry_account_purge_cleanup(${job.taskId}, ${job.lifecycleGeneration}, ${job.leaseToken}, ${delaySeconds})` })
        .from(sql`(values (1)) as purge_source`);
      return row?.accepted === true;
    },
  };
}

export interface AccountPurgeSummary {
  claimed: number;
  objectDeletes: number;
  completed: number;
  rescheduled: number;
  fenced: number;
  receiptsPruned: number;
  report?: AccountPurgeReport;
}

/**
 * Report-only obtains aggregate counts only. Execute is intentionally explicit,
 * bounded, and does not log owner IDs, keys, or provider errors.
 */
export function createAccountPurgeDispatcher(input: {
  mode: AccountPurgeRuntimeMode;
  store: AccountPurgeStore;
  deleter: MediaR2Deleter;
  /** Required for export tasks, so multipart uploads and late completion are proved absent. */
  exports?: Pick<ExportArchiveStore, "abort" | "listUploads" | "remove" | "exists">;
  random?: () => number;
  createLeaseToken?: () => string;
  batchSize?: number;
  leaseSeconds?: number;
  budgetMs?: number;
}) {
  const random = input.random ?? Math.random;
  const createLeaseToken = input.createLeaseToken ?? (() => crypto.randomUUID());
  const batchSize = Number.isInteger(input.batchSize) && input.batchSize! >= 1 && input.batchSize! <= 10 ? input.batchSize! : 5;
  const leaseSeconds = Number.isInteger(input.leaseSeconds) && input.leaseSeconds! >= 30 && input.leaseSeconds! <= 300 ? input.leaseSeconds! : 90;
  const budgetMs = Number.isInteger(input.budgetMs) && input.budgetMs! >= 5_000 && input.budgetMs! <= 120_000 ? input.budgetMs! : 20_000;
  return {
    async dispatchScheduled(): Promise<AccountPurgeSummary> {
      const summary: AccountPurgeSummary = { claimed: 0, objectDeletes: 0, completed: 0, rescheduled: 0, fenced: 0, receiptsPruned: 0 };
      if (input.mode === "report_only") return { ...summary, report: await input.store.report() };
      if (input.mode !== "execute") return summary;
      summary.receiptsPruned = await input.store.pruneExpiredReceipts(100);
      const endsAt = performance.now() + budgetMs;
      for (let remaining = batchSize; remaining > 0 && performance.now() < endsAt - 1_000; remaining -= 1) {
        const startedAt = performance.now();
        const [job] = await input.store.claim(1, createLeaseToken(), leaseSeconds);
        if (!job) continue;
        summary.claimed += 1;
        const providerDeadline = Math.min(startedAt + leaseSeconds * 1_000 - 5_000, endsAt - 1_000);
        try {
          if (providerDeadline - performance.now() < 1_000) throw new Error("Account purge lease budget exhausted.");
          if (!await input.store.authorize(job)) {
            summary.fenced += 1;
            continue;
          }
          if (job.exportCleanupTaskId) await removeExportArchive(input.exports, job.objectKey, job.exportUploadId, providerDeadline);
          else await deleteWithinLease(input.deleter, job.objectKey, Math.min(Math.floor(providerDeadline - performance.now()), 10_000));
          summary.objectDeletes += 1;
        } catch {
          const delaySeconds = Math.max(30, Math.ceil(retryDelayMs(1, random) / 1_000));
          if (await input.store.retry(job, delaySeconds)) summary.rescheduled += 1;
          else summary.fenced += 1;
          continue;
        }
        if (await input.store.complete(job)) summary.completed += 1;
        else summary.fenced += 1;
      }
      return summary;
    },
  };
}

type ExportCleanupObjects = Pick<ExportArchiveStore, "abort" | "listUploads" | "remove" | "exists">;

/** Every provider call shares the current account-object lease deadline. */
async function exportWithinBudget<T>(deadline: number, signal: AbortSignal, operation: (signal: AbortSignal) => Promise<T>): Promise<T> {
  if (signal.aborted || deadline - performance.now() < 1_000) throw new Error("Account purge export lease budget exhausted.");
  return operation(signal);
}

async function abortExportUploads(exports: ExportCleanupObjects, objectKey: string, knownUploadId: string | null, deadline: number, signal: AbortSignal): Promise<void> {
  if (knownUploadId) await exportWithinBudget(deadline, signal, (current) => exports.abort(objectKey, knownUploadId, current));
  for (const uploadId of await exportWithinBudget(deadline, signal, (current) => exports.listUploads(objectKey, current))) {
    await exportWithinBudget(deadline, signal, (current) => exports.abort(objectKey, uploadId, current));
  }
}

async function removeExportArchive(exports: ExportCleanupObjects | undefined, objectKey: string, knownUploadId: string | null, deadline: number): Promise<void> {
  // Fail closed. A multipart completion can race an object delete. The durable
  // export cleanup record remains after account finalization for later recovery.
  if (!exports) throw new Error("Account purge export cleanup is unavailable.");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Math.max(1, deadline - performance.now()));
  try {
    await abortExportUploads(exports, objectKey, knownUploadId, deadline, controller.signal);
    await exportWithinBudget(deadline, controller.signal, (signal) => exports.remove(objectKey, signal));
    await abortExportUploads(exports, objectKey, null, deadline, controller.signal);
    if (await exportWithinBudget(deadline, controller.signal, (signal) => exports.exists(objectKey, signal))) {
      await exportWithinBudget(deadline, controller.signal, (signal) => exports.remove(objectKey, signal));
    }
    if (await exportWithinBudget(deadline, controller.signal, (signal) => exports.exists(objectKey, signal))) {
      throw new Error("Account purge export archive still exists.");
    }
  } finally {
    clearTimeout(timeout);
  }
}

async function deleteWithinLease(deleter: MediaR2Deleter, objectKey: string, timeoutMs: number): Promise<void> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => { controller.abort(); reject(new Error("Account purge R2 deletion timed out.")); }, timeoutMs);
    });
    await Promise.race([deleter.delete(objectKey, controller.signal), timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
