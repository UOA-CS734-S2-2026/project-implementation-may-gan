import { createRestrictedDataExportWorkerStore, type DayliDatabase } from "@dayli/db";
import type { ExportBuildStore } from "./export-worker";

/** Maps reviewed restricted-role procedures to the worker's opaque lease API. */
export function createPostgresExportBuildStore(database: DayliDatabase): ExportBuildStore {
  const procedures = createRestrictedDataExportWorkerStore(database);
  return {
    claim: async () => procedures.claim(),
    publish: async (input) => (await procedures.publish({
      id: input.job.id, leaseToken: input.job.leaseToken, lifecycleGeneration: input.job.lifecycleGeneration,
      objectKey: input.objectKey, snapshotCutoffAt: input.snapshotCutoffAt,
    })) ? "published" : "stale",
    fail: async (input) => procedures.fail({ id: input.job.id, leaseToken: input.job.leaseToken, category: input.category }),
  };
}
