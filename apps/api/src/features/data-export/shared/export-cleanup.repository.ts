import { sql, type DayliDatabase } from "@dayli/db";
import type { ExportCleanupStore } from "./export-cleanup";

/** Requires lifecycle_worker. App cannot inspect the private cleanup task or provider upload ID. */
export function createExportCleanupStore(database: DayliDatabase, proofOwnerId?: string): ExportCleanupStore {
  return {
    async expire(limit) {
      const [row] = await database.select({ count: proofOwnerId
        ? sql<number>`public.expire_due_account_exports_for_owner(${proofOwnerId}, ${limit})`
        : sql<number>`public.expire_due_account_exports(${limit})` })
        .from(sql`(values (1)) as export_cleanup_operation`);
      return Number(row?.count ?? 0);
    },
    async pruneResolved(limit) {
      // The short staging proof does not prune incidents belonging to other owners.
      if (proofOwnerId) return 0;
      const [row] = await database.select({ count: sql<number>`public.delete_expired_account_export_incidents(${limit})` })
        .from(sql`(values (1)) as export_cleanup_operation`);
      return Number(row?.count ?? 0);
    },
    async claim(token, seconds) {
      const [task] = await database.select({
        taskId: sql<string>`claimed.task_id`, key: sql<string>`claimed.object_key`,
        uploadId: sql<string | null>`claimed.upload_id`,
      }).from(proofOwnerId
        ? sql`public.claim_account_export_cleanup_for_owner(${proofOwnerId}, 1, ${token}, ${seconds}) as claimed`
        : sql`public.claim_account_export_cleanup(1, ${token}, ${seconds}) as claimed`);
      return task ?? null;
    },
    async finish(taskId, token) {
      const [row] = await database.select({ accepted: sql<boolean>`public.finish_account_export_cleanup(${taskId}, ${token})` })
        .from(sql`(values (1)) as export_cleanup_operation`);
      return row?.accepted === true;
    },
    async retry(taskId, token, delaySeconds) {
      const [row] = await database.select({ accepted: sql<boolean>`public.retry_account_export_cleanup(${taskId}, ${token}, ${delaySeconds})` })
        .from(sql`(values (1)) as export_cleanup_operation`);
      return row?.accepted === true;
    },
  };
}
