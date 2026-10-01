import { createRestrictedDataExportWorkerStore, type DayliDatabase } from "@dayli/db";

/** Transitions one database-clock-expired archive into durable object cleanup. */
export async function runOneDataExportExpiry(database: DayliDatabase): Promise<"idle" | "expired"> {
  return (await createRestrictedDataExportWorkerStore(database).expireReadyExport()) ? "expired" : "idle";
}
