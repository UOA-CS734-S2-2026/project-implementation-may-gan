import type { HyperdriveBinding } from "@dayli/db";
import type { ApiEnv } from "../../env";
import { createRestrictedExportFileSource, createRestrictedExportRecordSource } from "../../features/data-export/build-export/export-source.repository";
import { createExportBuildStore } from "../../features/data-export/build-export/export-worker.repository";
import { createExportWorker } from "../../features/data-export/build-export/export-worker";
import { createExportArchiveStore } from "../../features/data-export/shared/export-r2-archive";
import { createExportR2RangeReader } from "../../features/data-export/build-export/export-r2-range";
import { createExportCleanupStore } from "../../features/data-export/shared/export-cleanup.repository";
import { createExportCleanupDispatcher } from "../../features/data-export/shared/export-cleanup";
import { withHyperdriveDatabase } from "../database/hyperdrive";
import { readR2RuntimeConfiguration } from "../media/r2";

/** Construction alone has no side effects. No scheduled handler invokes this yet. */
export function createExportRuntimeForEnv(env: Partial<ApiEnv>) {
  const r2 = readR2RuntimeConfiguration(env);
  const workerBinding: HyperdriveBinding | undefined = env.EXPORT_WORKER_HYPERDRIVE;
  if (!r2 || !workerBinding) return undefined;
  const objects = createExportArchiveStore(r2);
  return {
    runBuildOnce: () => withHyperdriveDatabase(workerBinding, (database) => createExportWorker({
      store: createExportBuildStore(database),
      records: createRestrictedExportRecordSource(database),
      files: createRestrictedExportFileSource(database, createExportR2RangeReader(r2)),
      objects,
    }).runOnce()),
    runCleanupOnce: () => withHyperdriveDatabase(workerBinding, (database) => createExportCleanupDispatcher({
      store: createExportCleanupStore(database), objects,
    }).runOnce()),
  };
}
