import { sql, type DayliDatabase } from "@dayli/db";
import type { ExportBuildStore } from "./export-worker";

/** Must be backed by a lifecycle_worker connection, never the ordinary app Hyperdrive binding. */
export function createExportBuildStore(database: DayliDatabase): ExportBuildStore {
  async function result(statement: ReturnType<typeof sql>): Promise<boolean> {
    const [row] = await database.select({ accepted: sql<boolean>`${statement}` })
      .from(sql`(values (1)) as export_operation`);
    return row?.accepted === true;
  }
  return {
    async claim(token, seconds) {
      const [claim] = await database.select({
        requestId: sql<string>`claimed.request_id`,
        selectionCutoffAt: sql<Date | string>`claimed.selection_cutoff_at`,
      }).from(sql`public.claim_account_exports(1, ${token}, ${seconds}) as claimed`);
      if (!claim) return null;
      const cutoff = new Date(claim.selectionCutoffAt);
      if (!Number.isFinite(cutoff.getTime())) throw new Error("Invalid export selection cutoff.");
      return { requestId: claim.requestId, leaseToken: token, selectionCutoffAt: cutoff };
    },
    async reserve(selection) {
      const [row] = await database.select({ key: sql<string | null>`public.reserve_account_export_archive(${selection.requestId}, ${selection.leaseToken})` })
        .from(sql`(values (1)) as export_operation`);
      return row?.key ?? null;
    },
    register: (selection, key, uploadId) => result(sql`public.register_account_export_upload(${selection.requestId}, ${selection.leaseToken}, ${key}, ${uploadId})`),
    renew: (selection, seconds) => result(sql`public.renew_account_export_lease(${selection.requestId}, ${selection.leaseToken}, ${seconds})`),
    publish: (selection, key) => result(sql`public.publish_account_export_archive(${selection.requestId}, ${selection.leaseToken}, ${key})`),
    fail: (selection, category) => result(sql`public.fail_account_export_build(${selection.requestId}, ${selection.leaseToken}, ${category})`),
  };
}
