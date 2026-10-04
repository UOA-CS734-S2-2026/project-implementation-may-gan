import { createHyperdriveDatabase, type HyperdriveBinding } from "@dayli/db";
import type { ApiEnv } from "../../env";
import { createR2Deleter, readR2RuntimeConfiguration } from "../media/r2";
import {
  createPostgresPostTrashCleanupStore,
  createPostTrashCleanupDispatcher,
  type PostTrashCleanupSummary,
} from "./post-trash-cleanup";

function connectionString(binding: HyperdriveBinding | undefined): string | undefined {
  const value = binding?.connectionString;
  return typeof value === "string" && value.trim() === value && value.length > 0 ? value : undefined;
}

function hasLifecycleWorkerRole(value: string): boolean {
  try { return decodeURIComponent(new URL(value).username) === "lifecycle_worker"; }
  catch { return false; }
}

/**
 * Cleanup is admitted only with a distinct lifecycle-worker connection and a
 * complete object-store configuration. It never falls back to the app role.
 */
export function hasPostTrashCleanupDependencies(env: Partial<ApiEnv>): env is ApiEnv & {
  EXPORT_WORKER_HYPERDRIVE: HyperdriveBinding;
} {
  const app = connectionString(env.HYPERDRIVE);
  const worker = connectionString(env.EXPORT_WORKER_HYPERDRIVE);
  return !!app && !!worker && app !== worker && hasLifecycleWorkerRole(worker) &&
    !!readR2RuntimeConfiguration(env);
}

/** Returns null without opening a database or deleting objects when configuration is invalid. */
export async function runPostTrashCleanupForEnv(
  env: Partial<ApiEnv>,
): Promise<PostTrashCleanupSummary | null> {
  if (!hasPostTrashCleanupDependencies(env)) return null;
  const r2 = readR2RuntimeConfiguration(env);
  if (!r2) return null;

  const database = createHyperdriveDatabase(env.EXPORT_WORKER_HYPERDRIVE);
  try {
    return await createPostTrashCleanupDispatcher({
      mode: "execute",
      store: createPostgresPostTrashCleanupStore(database.db),
      deleter: createR2Deleter(r2),
    }).dispatchScheduled();
  } finally {
    await database.close();
  }
}
