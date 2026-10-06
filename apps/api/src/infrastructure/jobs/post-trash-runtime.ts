import { createHyperdriveDatabase, sql, type HyperdriveBinding } from "@dayli/db";
import type { ApiEnv } from "../../env";
import { createR2Deleter, readR2RuntimeConfiguration } from "../media/r2";
import {
  createPostgresPostTrashCleanupStore,
  createPostTrashCleanupDispatcher,
  type PostTrashCleanupSummary,
} from "./post-trash-cleanup";

function connectionString(binding: HyperdriveBinding | undefined): string | undefined {
  const value = binding?.connectionString;
  if (typeof value !== "string" || value.trim() !== value || value.length === 0) return undefined;
  try {
    const parsed = new URL(value);
    return (parsed.protocol === "postgres:" || parsed.protocol === "postgresql:") &&
      parsed.username.length > 0 && parsed.hostname.length > 0 && parsed.pathname.length > 1 ? value : undefined;
  } catch {
    return undefined;
  }
}

function connectionStringNamesLifecycleWorker(value: string | undefined): boolean {
  if (!value) return false;
  try { return decodeURIComponent(new URL(value).username) === "lifecycle_worker"; }
  catch { return false; }
}

export interface PostTrashCleanupAdmissionProof {
  structuralDependencies: boolean;
  connectionStringNamesLifecycleWorker: boolean;
  authoritativeWorkerRole: boolean;
  runtimeAdmitted: boolean;
}

async function hasAuthoritativeLifecycleWorkerRole(
  database: ReturnType<typeof createHyperdriveDatabase>["db"],
): Promise<boolean> {
  const [role] = await database.select({
    currentUser: sql<string>`current_user`,
    canClaim: sql<boolean>`has_function_privilege(current_user, 'public.claim_post_trash_cleanup(integer,text,integer)', 'EXECUTE')`,
  }).from(sql`(values (1)) as role_source`);
  return role?.currentUser === "lifecycle_worker" && role.canClaim === true;
}

/**
 * Cleanup requires distinct non-empty app and worker bindings plus complete
 * object-store configuration. The database session role is checked
 * authoritatively after connecting, rather than inferred from proxy metadata.
 */
export function hasPostTrashCleanupDependencies(env: Partial<ApiEnv>): env is ApiEnv & {
  EXPORT_WORKER_HYPERDRIVE: HyperdriveBinding;
} {
  const app = connectionString(env.HYPERDRIVE);
  const worker = connectionString(env.EXPORT_WORKER_HYPERDRIVE);
  return !!app && !!worker && app !== worker && !!readR2RuntimeConfiguration(env);
}

/** Read-only admission proof. It never claims work or constructs an R2 deleter. */
export async function provePostTrashCleanupAdmission(
  env: Partial<ApiEnv>,
): Promise<PostTrashCleanupAdmissionProof> {
  const worker = connectionString(env.EXPORT_WORKER_HYPERDRIVE);
  const structuralDependencies = hasPostTrashCleanupDependencies(env);
  const proof: PostTrashCleanupAdmissionProof = {
    structuralDependencies,
    connectionStringNamesLifecycleWorker: connectionStringNamesLifecycleWorker(worker),
    authoritativeWorkerRole: false,
    runtimeAdmitted: false,
  };
  if (!structuralDependencies) return proof;
  const database = createHyperdriveDatabase(env.EXPORT_WORKER_HYPERDRIVE);
  try {
    proof.authoritativeWorkerRole = await hasAuthoritativeLifecycleWorkerRole(database.db);
    proof.runtimeAdmitted = proof.authoritativeWorkerRole;
    return proof;
  } catch {
    throw new Error("Post Trash cleanup role admission query failed.");
  } finally {
    await database.close();
  }
}

/** Returns null without deleting objects when configuration or the authoritative role check is invalid. */
export async function runPostTrashCleanupForEnv(
  env: Partial<ApiEnv>,
): Promise<PostTrashCleanupSummary | null> {
  if (!hasPostTrashCleanupDependencies(env)) return null;
  const r2 = readR2RuntimeConfiguration(env);
  if (!r2) return null;

  const database = createHyperdriveDatabase(env.EXPORT_WORKER_HYPERDRIVE);
  try {
    if (!await hasAuthoritativeLifecycleWorkerRole(database.db)) return null;
    return await createPostTrashCleanupDispatcher({
      mode: "execute",
      store: createPostgresPostTrashCleanupStore(database.db),
      deleter: createR2Deleter(r2),
    }).dispatchScheduled();
  } finally {
    await database.close();
  }
}
