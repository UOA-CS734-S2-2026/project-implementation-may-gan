import { createRestrictedDataExportWorkerStore, type DayliDatabase } from "@dayli/db";
import type { ExportObjectStore } from "./export-worker";

/** Processes one durably leased orphan cleanup. Failed removes remain retryable. */
export async function runOneDataExportCleanup(database: DayliDatabase, objects: ExportObjectStore): Promise<"idle" | "deleted" | "retry"> {
  const store = createRestrictedDataExportWorkerStore(database);
  const cleanup = await store.claimCleanup();
  if (!cleanup) return "idle";
  try {
    await objects.remove(cleanup.objectKey);
    return await store.completeCleanup(cleanup.id, cleanup.leaseToken) ? "deleted" : "retry";
  } catch {
    await store.retryCleanup(cleanup.id, cleanup.leaseToken);
    return "retry";
  }
}
