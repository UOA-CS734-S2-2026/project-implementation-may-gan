import type { DayliDatabase } from "@dayli/db";
import { buildExportArchive, type ExportObjectStore } from "./export-worker";
import { createPostgresExportBuildStore } from "./export-worker.repository";
import { createPostgresExportSource } from "../shared/export-source.repository";

/** One bounded offline attempt. Invocation wiring remains disabled until rollout review. */
export async function runOneDataExport(database: DayliDatabase, objects: ExportObjectStore, now: () => Date = () => new Date()) {
  const store = createPostgresExportBuildStore(database);
  const job = await store.claim(now());
  if (!job) return "idle" as const;
  return buildExportArchive({ job, store, source: createPostgresExportSource(database), objects, now });
}
