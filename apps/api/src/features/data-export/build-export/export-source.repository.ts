import { exportSourceKinds } from "@dayli/contracts";
import { sql, type DayliDatabase } from "@dayli/db";
import type {
  ExportFileReference, ExportFileSource, ExportRecordSource,
} from "./archive-entries";

/** Requires a lifecycle_worker connection. The app role cannot execute this procedure. */
export function createRestrictedExportRecordSource(database: DayliDatabase): ExportRecordSource {
  return {
    async page(selection, kind, after, limit) {
      if (!exportSourceKinds.includes(kind) || limit < 1 || limit > 50) {
        throw new Error("Unreviewed export source page.");
      }
      return database.select({
        record_key: sql<string>`page.record_key`,
        payload: sql<Record<string, unknown>>`page.payload`,
      }).from(sql`public.read_account_export_page(
        ${selection.requestId}, ${selection.leaseToken}, ${kind}, ${after}, ${limit}) as page`);
    },
  };
}

/** Returns file references only. A separate per-range adapter must reauthorize bytes. */
export function createRestrictedExportFilePager(database: DayliDatabase): Pick<ExportFileSource, "page"> {
  return {
    async page(selection, after, limit) {
      if (limit < 1 || limit > 25) throw new Error("Unreviewed export file page.");
      const rows = await database.select({
        file_id: sql<string>`file_page.file_id`,
        post_id: sql<string | null>`file_page.post_id`,
        file_kind: sql<ExportFileReference["file_kind"]>`file_page.file_kind`,
        content_type: sql<string>`file_page.content_type`,
        byte_size: sql<string>`file_page.byte_size::text`,
        object_key: sql<string>`file_page.object_key`,
      }).from(sql`public.read_account_export_file_page(
        ${selection.requestId}, ${selection.leaseToken}, ${after}, ${limit}) as file_page`);
      return rows.map((row) => ({ ...row, byte_size: Number(row.byte_size) }));
    },
  };
}
