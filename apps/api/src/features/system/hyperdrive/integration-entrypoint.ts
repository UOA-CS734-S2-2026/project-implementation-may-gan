import {
  createHyperdriveDatabase,
  proveDatabaseConnection,
  proveDatabaseTransactions,
  verifyDatabaseTransactionVisibility,
  type TransactionProof,
  type TransactionVisibilityProof,
  sql,
} from "@dayli/db";
import { WorkerEntrypoint } from "cloudflare:workers";
import type { ApiEnv } from "../../../env";
import { notificationRuntimeProof } from "../../../infrastructure/push/notification-runtime-proof";
import { probeOAuthEgressMatrix, probeOAuthEgress, type OAuthEgressProof } from "../../../infrastructure/push/oauth-egress-probe";
import { provePostTrashCleanupAdmission, type PostTrashCleanupAdmissionProof } from "../../../infrastructure/jobs/post-trash-runtime";

export interface StagingRevisionProof {
  revision: string;
  storageDigest: string;
}

export interface PostTrashWorkerFenceProof {
  appRoleDenied: boolean;
  lifecycleWorkerRole: boolean;
  aggregateReadable: boolean;
  due: number;
  failed: number;
  leased: number;
}

/**
 * This entrypoint is callable only through a Worker service binding. It is not
 * registered as an HTTP route.
 */
export class HyperdriveIntegrationEntrypoint extends WorkerEntrypoint<ApiEnv> {
  async diagnoseNotificationRuntime() {
    const proof = await notificationRuntimeProof(this.env);
    console.info("notification runtime diagnostics", proof);
    return proof;
  }

  async diagnoseOAuthEgressMatrix() {
    const rows = await probeOAuthEgressMatrix(this.env.API_RATE_LIMIT_SCOPE);
    for (const row of rows) console.info("notification egress matrix", row);
    return rows;
  }

  async diagnoseOAuthEgress(): Promise<OAuthEgressProof> {
    const proof = await probeOAuthEgress(this.env.API_RATE_LIMIT_SCOPE);
    console.info("notification OAuth egress diagnostics", proof);
    return proof;
  }

  async proveStagingRevision(): Promise<StagingRevisionProof> {
    const revision = this.env.STAGING_RELEASE_SHA;
    const accountId = this.env.R2_ACCOUNT_ID;
    const bucketName = this.env.R2_BUCKET_NAME;
    if (!revision || !/^[a-f0-9]{40}$/.test(revision) || !accountId || !bucketName) {
      throw new Error("Staging release attribution is unavailable.");
    }
    const bytes = new TextEncoder().encode(`${accountId}\n${bucketName}`);
    const hash = await crypto.subtle.digest("SHA-256", bytes);
    const storageDigest = Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, "0")).join("");
    return { revision, storageDigest };
  }

  async provePostTrashCleanupAdmission(): Promise<PostTrashCleanupAdmissionProof> {
    return provePostTrashCleanupAdmission(this.env);
  }

  async provePostTrashWorkerFence(): Promise<PostTrashWorkerFenceProof> {
    if (!this.env.EXPORT_WORKER_HYPERDRIVE ||
        this.env.EXPORT_WORKER_HYPERDRIVE.connectionString === this.env.HYPERDRIVE.connectionString) {
      throw new Error("The restricted lifecycle worker binding is unavailable.");
    }
    const app = createHyperdriveDatabase(this.env.HYPERDRIVE);
    const worker = createHyperdriveDatabase(this.env.EXPORT_WORKER_HYPERDRIVE);
    try {
      const [appRole] = await app.db.select({
        currentUser: sql<string>`current_user`,
        canReport: sql<boolean>`has_function_privilege(current_user, 'public.report_post_trash_cleanup()', 'EXECUTE')`,
      }).from(sql`(values (1)) as role_source`);
      const [workerRole] = await worker.db.select({
        currentUser: sql<string>`current_user`,
        canReport: sql<boolean>`has_function_privilege(current_user, 'public.report_post_trash_cleanup()', 'EXECUTE')`,
      }).from(sql`(values (1)) as role_source`);
      const [report] = await worker.db.select({
        dueCount: sql<string | number>`due_count`,
        failedCount: sql<string | number>`failed_count`,
        leasedCount: sql<string | number>`leased_count`,
      }).from(sql`public.report_post_trash_cleanup()`);
      if (appRole?.currentUser !== "app" || appRole.canReport !== false ||
          workerRole?.currentUser !== "lifecycle_worker" || workerRole.canReport !== true || !report) {
        throw new Error("Post Trash worker fencing proof failed.");
      }
      return {
        appRoleDenied: true,
        lifecycleWorkerRole: true,
        aggregateReadable: true,
        due: Number(report.dueCount),
        failed: Number(report.failedCount),
        leased: Number(report.leasedCount),
      };
    } finally {
      await Promise.allSettled([app.close(), worker.close()]);
    }
  }

  async proveConnection(): Promise<{ ok: 1 }> {
    const database = createHyperdriveDatabase(this.env.HYPERDRIVE);

    try {
      return await proveDatabaseConnection(database.db);
    } finally {
      await database.close();
    }
  }

  async proveTransactions(group: string): Promise<TransactionProof> {
    const database = createHyperdriveDatabase(this.env.HYPERDRIVE);
    try {
      return await proveDatabaseTransactions(database.db, group);
    } finally {
      await database.close();
    }
  }

  async verifyTransactions(
    group: string,
    committedRow: string,
    rolledBackRow: string,
  ): Promise<TransactionVisibilityProof> {
    const database = createHyperdriveDatabase(this.env.HYPERDRIVE);
    try {
      return await verifyDatabaseTransactionVisibility(database.db, group, committedRow, rolledBackRow);
    } finally {
      await database.close();
    }
  }
}
