import type { ExportArchiveStore } from "./export-r2-archive";

export interface ExportCleanupTask {
  taskId: string;
  key: string;
  uploadId: string | null;
}
export interface ExportCleanupStore {
  expire(limit: number): Promise<number>;
  pruneResolved(limit: number): Promise<number>;
  claim(token: string, seconds: number): Promise<ExportCleanupTask | null>;
  finish(taskId: string, token: string): Promise<boolean>;
  retry(taskId: string, token: string, delaySeconds: number): Promise<boolean>;
}
export interface ExportCleanupResult { expired: number; pruned: number; claimed: number; confirmed: number; retried: number; fenced: number }

/** Not scheduled. A second durable pass after 24 hours checks late provider completions. */
export function createExportCleanupDispatcher(input: {
  store: ExportCleanupStore;
  objects: Pick<ExportArchiveStore, "abort" | "listUploads" | "remove" | "exists">;
  createToken?: () => string;
  budgetMs?: number;
}) {
  const budgetMs = input.budgetMs ?? 120_000;
  if (!Number.isSafeInteger(budgetMs) || budgetMs < 30_000 || budgetMs > 240_000) {
    throw new Error("Invalid export cleanup budget.");
  }
  return {
    async runOnce(): Promise<ExportCleanupResult> {
      const result: ExportCleanupResult = { expired: 0, pruned: 0, claimed: 0, confirmed: 0, retried: 0, fenced: 0 };
      const deadline = performance.now() + budgetMs;
      result.expired = await input.store.expire(10);
      result.pruned = await input.store.pruneResolved(100);
      for (let count = 0; count < 3 && performance.now() < deadline - 30_000; count += 1) {
        const token = (input.createToken ?? (() => crypto.randomUUID()))();
        const task = await input.store.claim(token, 300);
        if (!task) break;
        result.claimed += 1;
        try {
          if (task.uploadId) await input.objects.abort(task.key, task.uploadId);
          for (const id of await input.objects.listUploads(task.key)) await input.objects.abort(task.key, id);
          await input.objects.remove(task.key);
          // A completed object can appear while an abort races provider completion.
          for (const id of await input.objects.listUploads(task.key)) await input.objects.abort(task.key, id);
          if (await input.objects.exists(task.key)) await input.objects.remove(task.key);
          if (await input.objects.exists(task.key)) throw new Error("Export archive still exists.");
          if (await input.store.finish(task.taskId, token)) result.confirmed += 1;
          else result.fenced += 1;
        } catch {
          // Retain the task and upload ID. A later run retries both the known ID
          // and an exact-key listing before considering an object absent.
          if (await input.store.retry(task.taskId, token, 60)) result.retried += 1;
          else result.fenced += 1;
        }
      }
      return result;
    },
  };
}
