import { createRestrictedDataExportWorkerStore, type DayliDatabase } from "@dayli/db";
import type { ExportObjectStore } from "./export-worker";

type CleanupStore = Pick<ReturnType<typeof createRestrictedDataExportWorkerStore>, "claimCleanup" | "completeCleanup" | "retryCleanup">;

/** Reconciles a claimed tombstone without holding a database transaction over R2. */
export async function runClaimedDataExportCleanup(store: CleanupStore, cleanup: NonNullable<Awaited<ReturnType<CleanupStore["claimCleanup"]>>>, objects: ExportObjectStore): Promise<"deleted" | "retry"> {
  try {
    // Abort both the recorded upload and any upload whose create response was
    // lost. The task stays as a tombstone after a successful pass, so a late
    // completion is reconciled on the next bounded cleanup run.
    const uploadIds = new Set(await objects.listMultipartUploads(cleanup.objectKey));
    if (cleanup.multipartUploadId) uploadIds.add(cleanup.multipartUploadId);
    for (const uploadId of uploadIds) await objects.abort({ key: cleanup.objectKey, uploadId });
    await objects.remove(cleanup.objectKey);
    return await store.completeCleanup(cleanup.id, cleanup.leaseToken) ? "deleted" : "retry";
  } catch {
    await store.retryCleanup(cleanup.id, cleanup.leaseToken);
    return "retry";
  }
}

/** Processes one durably leased orphan cleanup. Failed removes remain retryable. */
export async function runOneDataExportCleanup(database: DayliDatabase, objects: ExportObjectStore): Promise<"idle" | "deleted" | "retry"> {
  const store = createRestrictedDataExportWorkerStore(database);
  const cleanup = await store.claimCleanup();
  if (!cleanup) return "idle";
  return runClaimedDataExportCleanup(store, cleanup, objects);
}
