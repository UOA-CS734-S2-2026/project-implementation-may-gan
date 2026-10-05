import { createHyperdriveDatabase, type HyperdriveBinding } from "@dayli/db";
import { resolveLifecycleExecutionMode } from "@dayli/domain";
import type { ApiEnv } from "../../env";
import { createAccountPurgeDispatcher, createAccountPurgeStore, type AccountPurgeSummary } from "./account-purge";

function connectionString(binding: HyperdriveBinding | undefined): string | undefined {
  const value = binding?.connectionString;
  return typeof value === "string" && value.trim() === value && value.length > 0 ? value : undefined;
}

function hasLifecycleWorkerRole(value: string): boolean {
  try { return decodeURIComponent(new URL(value).username) === "lifecycle_worker"; }
  catch { return false; }
}

/**
 * This is deliberately not called by the scheduled Worker. It permits a
 * reviewed report-only staging invocation with the restricted connection, but
 * rejects execute mode until a separate activation and runtime review.
 */
export async function runAccountPurgeReportForEnv(env: Partial<ApiEnv>): Promise<AccountPurgeSummary | null> {
  if (resolveLifecycleExecutionMode(env.ACCOUNT_PURGE_EXECUTION_MODE) !== "report_only") return null;
  const app = connectionString(env.HYPERDRIVE);
  const worker = connectionString(env.EXPORT_WORKER_HYPERDRIVE);
  if (!app || !worker || app === worker || !hasLifecycleWorkerRole(worker)) return null;
  const database = createHyperdriveDatabase(env.EXPORT_WORKER_HYPERDRIVE!);
  try {
    // A deleter is required by the dispatcher type but report-only never calls it.
    return await createAccountPurgeDispatcher({
      mode: "report_only", store: createAccountPurgeStore(database.db),
      deleter: { delete: async () => undefined },
    }).dispatchScheduled();
  } finally {
    await database.close();
  }
}
