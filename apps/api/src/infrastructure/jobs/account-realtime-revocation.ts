import { createHyperdriveDatabase, sql, type DayliDatabase, type HyperdriveBinding } from "@dayli/db";
import type { ApiEnv } from "../../env";
import { retryDelayMs } from "./dispatch-outbox";

export interface RealtimeRevocationJob {
  ownerId: string;
  lifecycleGeneration: number;
  attempts: number;
  leaseToken: string;
}

export interface RealtimeRevocationReport {
  due: number;
  leased: number;
  oldestPendingSeconds: number;
  completed: number;
  superseded: number;
  failed: number;
}

export interface RealtimeRevocationStore {
  claim(limit: number, leaseToken: string, leaseSeconds: number): Promise<RealtimeRevocationJob[]>;
  complete(job: RealtimeRevocationJob): Promise<boolean>;
  retry(job: RealtimeRevocationJob, delaySeconds: number, terminal: boolean): Promise<boolean>;
  prune(limit: number): Promise<number>;
  report(): Promise<RealtimeRevocationReport>;
}

/** The lifecycle_worker can use only these fenced procedures, never table DML. */
export function createRealtimeRevocationStore(database: DayliDatabase): RealtimeRevocationStore {
  return {
    async claim(limit, leaseToken, leaseSeconds) {
      const rows = await database.select({
        ownerId: sql<string>`owner_id`, lifecycleGeneration: sql<unknown>`lifecycle_generation`,
        attempts: sql<unknown>`attempt_count`, leaseToken: sql<string>`lease_token`,
      }).from(sql`public.claim_account_realtime_revocations(${limit}, ${leaseToken}, ${leaseSeconds})`);
      return rows.map((row) => ({
        ownerId: row.ownerId, lifecycleGeneration: decodeSafeInteger(row.lifecycleGeneration, "lifecycle generation", 1),
        attempts: decodeSafeInteger(row.attempts, "attempt count", 0), leaseToken: row.leaseToken,
      }));
    },
    async complete(job) {
      const [row] = await database.select({ accepted: sql<boolean>`public.complete_account_realtime_revocation(
        ${job.ownerId}, ${job.lifecycleGeneration}, ${job.leaseToken}
      )` }).from(sql`(values (1)) as revocation_completion`);
      return row?.accepted === true;
    },
    async retry(job, delaySeconds, terminal) {
      const [row] = await database.select({ accepted: sql<boolean>`public.retry_account_realtime_revocation(
        ${job.ownerId}, ${job.lifecycleGeneration}, ${job.leaseToken}, ${delaySeconds}, ${terminal}
      )` }).from(sql`(values (1)) as revocation_retry`);
      return row?.accepted === true;
    },
    async prune(limit) {
      const [row] = await database.select({ deleted: sql<number>`public.prune_account_realtime_revocations(${limit})` })
        .from(sql`(values (1)) as revocation_prune`);
      return Number(row?.deleted ?? 0);
    },
    async report() {
      const [row] = await database.select({
        due: sql<number>`due_count`, leased: sql<number>`leased_count`,
        oldestPendingSeconds: sql<number>`oldest_pending_seconds`, completed: sql<number>`completed_count`,
        superseded: sql<number>`superseded_count`, failed: sql<number>`failed_count`,
      }).from(sql`public.report_account_realtime_revocations()`);
      return {
        due: Number(row?.due ?? 0), leased: Number(row?.leased ?? 0),
        oldestPendingSeconds: Number(row?.oldestPendingSeconds ?? 0), completed: Number(row?.completed ?? 0),
        superseded: Number(row?.superseded ?? 0), failed: Number(row?.failed ?? 0),
      };
    },
  };
}

function decodeSafeInteger(value: unknown, label: string, minimum: number): number {
  const decoded = typeof value === "number" ? value : typeof value === "string" && /^[0-9]+$/.test(value) ? Number(value) : Number.NaN;
  if (!Number.isSafeInteger(decoded) || decoded < minimum) throw new Error(`Invalid ${label}.`);
  return decoded;
}

interface RealtimeRevocationStub {
  fetch(request: Request): Promise<Response>;
}

export interface RealtimeRevocationSummary {
  claimed: number;
  completed: number;
  rescheduled: number;
  failed: number;
  fenced: number;
  pruned: number;
  report: RealtimeRevocationReport;
}

export function createRealtimeRevocationDispatcher(input: {
  store: RealtimeRevocationStore;
  namespace: DurableObjectNamespace;
  random?: () => number;
  createLeaseToken?: () => string;
  batchSize?: number;
  leaseSeconds?: number;
  rpcTimeoutMs?: number;
  maxAttempts?: number;
}) {
  const random = input.random ?? Math.random;
  const createLeaseToken = input.createLeaseToken ?? (() => crypto.randomUUID());
  const batchSize = input.batchSize ?? 25;
  const leaseSeconds = input.leaseSeconds ?? 60;
  const rpcTimeoutMs = input.rpcTimeoutMs ?? 10_000;
  const maxAttempts = input.maxAttempts ?? 12;
  return {
    async dispatchScheduled(): Promise<RealtimeRevocationSummary> {
      const summary = { claimed: 0, completed: 0, rescheduled: 0, failed: 0, fenced: 0, pruned: await input.store.prune(100) };
      for (let remaining = batchSize; remaining > 0; remaining -= 1) {
        const [job] = await input.store.claim(1, createLeaseToken(), leaseSeconds);
        if (!job) break;
        summary.claimed += 1;
        try {
          const stub = input.namespace.get(input.namespace.idFromName(job.ownerId)) as unknown as RealtimeRevocationStub;
          const response = await withTimeout(stub.fetch(new Request("https://user-realtime.internal/revoke-deletion", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ generation: job.lifecycleGeneration }),
          })), rpcTimeoutMs);
          if (!response.ok) throw new Error("Realtime revocation failed.");
          if (await input.store.complete(job)) summary.completed += 1;
          else summary.fenced += 1;
        } catch {
          const delay = Math.min(3600, Math.max(1, Math.ceil(retryDelayMs(job.attempts, random) / 1000)));
          const terminal = job.attempts >= maxAttempts;
          if (await input.store.retry(job, delay, terminal)) {
            if (terminal) summary.failed += 1;
            else summary.rescheduled += 1;
          } else summary.fenced += 1;
        }
      }
      return { ...summary, report: await input.store.report() };
    },
  };
}

async function withTimeout<T>(operation: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation,
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("Realtime revocation RPC timed out.")), timeoutMs); }),
    ]);
  } finally { if (timer) clearTimeout(timer); }
}

function connectionString(binding: HyperdriveBinding | undefined): string | undefined {
  const value = binding?.connectionString;
  return typeof value === "string" && value.trim() === value && value.length > 0 ? value : undefined;
}

function isLifecycleWorker(value: string): boolean {
  try { return decodeURIComponent(new URL(value).username) === "lifecycle_worker"; }
  catch { return false; }
}

export type RealtimeRevocationBindingFailure = "realtime_missing" | "app_database_missing_or_invalid" | "worker_database_missing_or_invalid" | "database_bindings_identical" | "worker_role_invalid";

/** Fixed reasons only. Never expose connection strings or their credentials. */
export function realtimeRevocationBindingFailure(env: Partial<ApiEnv>): RealtimeRevocationBindingFailure | undefined {
  if (!env.USER_REALTIME) return "realtime_missing";
  const app = connectionString(env.HYPERDRIVE);
  const worker = connectionString(env.EXPORT_WORKER_HYPERDRIVE);
  if (!app) return "app_database_missing_or_invalid";
  if (!worker) return "worker_database_missing_or_invalid";
  if (app === worker) return "database_bindings_identical";
  if (!isLifecycleWorker(worker)) return "worker_role_invalid";
  return undefined;
}

/** Safe scheduled side effect. It cannot purge content or enable deletion requests. */
export async function runRealtimeRevocationsForEnv(env: Partial<ApiEnv>): Promise<RealtimeRevocationSummary | null> {
  if (realtimeRevocationBindingFailure(env)) return null;
  const database = createHyperdriveDatabase(env.EXPORT_WORKER_HYPERDRIVE!);
  try {
    return await createRealtimeRevocationDispatcher({
      store: createRealtimeRevocationStore(database.db), namespace: env.USER_REALTIME!,
    }).dispatchScheduled();
  } finally { await database.close(); }
}
