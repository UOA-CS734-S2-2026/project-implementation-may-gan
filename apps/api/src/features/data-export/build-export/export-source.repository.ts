import { exportSourceKinds } from "@dayli/contracts";
import { sql, type DayliDatabase } from "@dayli/db";
import type {
  ExportFileReference, ExportFileSource, ExportRecordSource, ExportSelection,
} from "./archive-entries";
import type { ExportRangeReader } from "./export-r2-range";

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
export async function authorizeExportFileRead(database: DayliDatabase, selection: ExportSelection, fileId: string) {
  if (!fileId || fileId.length > 200) throw new Error("Invalid export file ID.");
  const [authorized] = await database.select({
    object_key: sql<string>`authorized.object_key`,
    byte_size: sql<string>`authorized.byte_size::text`,
    content_type: sql<string>`authorized.content_type`,
  }).from(sql`public.authorize_account_export_file(
    ${selection.requestId}, ${selection.leaseToken}, ${fileId}) as authorized`);
  return authorized ? { ...authorized, byte_size: Number(authorized.byte_size) } : null;
}

export function createRestrictedExportFilePager(database: DayliDatabase): Pick<ExportFileSource, "page"> {
  return {
    async page(selection, after, limit) {
      if (limit < 1 || limit > 25) throw new Error("Unreviewed export file page.");
      const rows = await database.select({
        file_id: sql<string>`file_page.file_id`,
        post_id: sql<string | null>`file_page.post_id`,
        post_trashed: sql<boolean>`file_page.post_trashed`,
        file_kind: sql<ExportFileReference["file_kind"]>`file_page.file_kind`,
        content_type: sql<string>`file_page.content_type`,
        byte_size: sql<string>`file_page.byte_size::text`,
        object_key: sql<string>`file_page.object_key`,
      }).from(sql`public.read_account_export_file_page_v2(
        ${selection.requestId}, ${selection.leaseToken}, ${after}, ${limit}) as file_page`);
      return rows.map((row) => ({ ...row, byte_size: Number(row.byte_size) }));
    },
  };
}

/** A fresh database proof precedes each bounded R2 range, then follows the final range. */
export function createRestrictedExportFileSource(database: DayliDatabase, r2: ExportRangeReader): ExportFileSource {
  const pager = createRestrictedExportFilePager(database);
  async function reauthorize(selection: ExportSelection, file: ExportFileReference): Promise<void> {
    const current = await authorizeExportFileRead(database, selection, file.file_id);
    if (!current || current.object_key !== file.object_key || current.content_type !== file.content_type
      || current.byte_size !== file.byte_size) throw new Error("Export file authorization changed.");
  }
  return {
    page: pager.page,
    async *read(selection, reference) {
      if (!Number.isSafeInteger(reference.byte_size) || reference.byte_size < 1) {
        throw new Error("Invalid export file size.");
      }
      let etag: string | undefined;
      for (let offset = 0; offset < reference.byte_size; offset += 512 * 1024) {
        await reauthorize(selection, reference);
        const end = Math.min(reference.byte_size - 1, offset + 512 * 1024 - 1);
        const part = await r2.read(reference.object_key, offset, end, reference.byte_size);
        if (part.bytes.byteLength !== end - offset + 1) throw new Error("Invalid export file range length.");
        if (etag !== undefined && etag !== part.etag) throw new Error("Export file changed while reading.");
        etag = part.etag;
        yield part.bytes;
      }
      await reauthorize(selection, reference);
    },
  };
}
