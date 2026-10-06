import { createHyperdriveDatabase, sql, type DayliDatabase, type DayliDatabaseClient, type HyperdriveBinding } from "@dayli/db";
import type { ApiEnv } from "../../env";

export type MaintenanceBindingFailure = "app_database_missing_or_invalid" | "worker_database_missing_or_invalid" | "database_bindings_identical";
export type MaintenanceRoleFailure = "app_role_invalid" | "worker_role_invalid" | "database_role_unavailable";

function connectionString(binding: HyperdriveBinding | undefined): string | undefined {
  const value = binding?.connectionString;
  if (typeof value !== "string" || value.trim() !== value || !value) return undefined;
  try {
    const url = new URL(value);
    return ["postgres:", "postgresql:"].includes(url.protocol) && url.hostname && url.username ? value : undefined;
  } catch { return undefined; }
}

/** Structural checks only. Hyperdrive proxy usernames do not prove the SQL role. */
export function maintenanceDatabaseBindingFailure(env: Partial<ApiEnv>): MaintenanceBindingFailure | undefined {
  const app = connectionString(env.HYPERDRIVE);
  const worker = connectionString(env.EXPORT_WORKER_HYPERDRIVE);
  if (!app) return "app_database_missing_or_invalid";
  if (!worker) return "worker_database_missing_or_invalid";
  if (app === worker) return "database_bindings_identical";
  return undefined;
}

/** Both roles are checked on their own connections before any maintenance action. */
export async function withLifecycleWorkerDatabase<T>(
  env: Partial<ApiEnv>,
  run: (database: DayliDatabase) => Promise<T>,
  onRejected?: (reason: MaintenanceBindingFailure | MaintenanceRoleFailure) => void,
): Promise<T | null> {
  const reject = (reason: MaintenanceBindingFailure | MaintenanceRoleFailure) => {
    // Diagnostics cannot weaken a rejected guard or change dispatch semantics.
    try { onRejected?.(reason); } catch { /* Keep the guard fail closed. */ }
    return null;
  };
  const failure = maintenanceDatabaseBindingFailure(env);
  if (failure) return reject(failure);
  let app: DayliDatabaseClient | undefined, worker: DayliDatabaseClient | undefined;
  try {
    let appRole: { currentUser: string } | undefined, workerRole: { currentUser: string } | undefined;
    try {
      app = createHyperdriveDatabase(env.HYPERDRIVE!);
      worker = createHyperdriveDatabase(env.EXPORT_WORKER_HYPERDRIVE!);
      const [appRows, workerRows] = await Promise.all([app, worker].map(database =>
        // A volatile clock expression prevents Hyperdrive from caching this proof.
        database.db.select({ currentUser: sql<string>`current_user`, checkedAt: sql`clock_timestamp()` }).from(sql`(values (1)) as lifecycle_role_source`),
      ));
      appRole = appRows[0]; workerRole = workerRows[0];
    } catch { return reject("database_role_unavailable"); }
    if (appRole?.currentUser !== "app") return reject("app_role_invalid");
    if (workerRole?.currentUser !== "lifecycle_worker") return reject("worker_role_invalid");
    // The restricted role's existing procedure permissions and fencing still apply.
    return await run(worker!.db);
  } finally {
    await Promise.all([app?.close(), worker?.close()]);
  }
}
