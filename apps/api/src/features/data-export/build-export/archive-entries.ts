import { allowedContentTypes, exportArchiveVersion, exportSourceKinds, type ExportSourceKind } from "@dayli/contracts";
import { ExportZipLimitError, MAX_EXPORT_ENTRIES, MAX_EXPORT_ENTRY_BYTES, type ExportZipEntry } from "./zip-stream";

export const EXPORT_PAGE_SIZE = 50;
export const MAX_EXPORT_RECORD_BYTES = 32 * 1024;
export const MAX_EXPORT_RECORDS = 50_000;
const encoder = new TextEncoder();

export interface ExportSelection {
  requestId: string;
  leaseToken: string;
  selectionCutoffAt: Date;
}
export interface ExportRecordPage {
  record_key: string;
  payload: Record<string, unknown>;
}
export interface ExportRecordSource {
  page(input: ExportSelection, kind: ExportSourceKind, after: string | null, limit: number): Promise<ExportRecordPage[]>;
}
export interface ExportFileReference {
  file_id: string;
  post_id: string | null;
  post_trashed: boolean;
  file_kind: "post_media" | "profile_avatar";
  content_type: string;
  byte_size: number;
  object_key: string;
}
export interface ExportFileSource {
  page(input: ExportSelection, after: string | null, limit: number): Promise<ExportFileReference[]>;
  /** Recheck the lease and live reference before and during every bounded range read. */
  read(input: ExportSelection, reference: ExportFileReference): AsyncIterable<Uint8Array>;
}

function encodeBoundedRecord(value: unknown): Uint8Array {
  function check(item: unknown, depth: number): void {
    if (depth > 8) throw new ExportZipLimitError("Export record nesting limit exceeded.");
    if (item === null || typeof item === "boolean") return;
    if (typeof item === "number" && Number.isFinite(item)) return;
    if (typeof item === "string" && encoder.encode(item).byteLength <= MAX_EXPORT_RECORD_BYTES) return;
    if (Array.isArray(item) && item.length <= 200) {
      item.forEach((entry) => check(entry, depth + 1));
      return;
    }
    if (typeof item === "object" && item && Object.getPrototypeOf(item) === Object.prototype) {
      const entries = Object.entries(item);
      if (entries.length > 100) throw new ExportZipLimitError("Export record has too many fields.");
      for (const [key, entry] of entries) {
        check(key, depth + 1);
        check(entry, depth + 1);
      }
      return;
    }
    throw new ExportZipLimitError("Export record contains an unsupported value.");
  }
  check(value, 0);
  const serialized = encoder.encode(`${JSON.stringify(value)}\n`);
  if (serialized.byteLength > MAX_EXPORT_RECORD_BYTES) {
    throw new ExportZipLimitError("Export record exceeds its byte limit.");
  }
  return serialized;
}

/** `selectionCutoffAt` selects each source independently, not a database snapshot. */
export async function* recordArchiveEntries(
  selection: ExportSelection,
  source: ExportRecordSource,
  files?: ExportFileSource,
): AsyncGenerator<ExportZipEntry> {
  const manifest = {
    archiveVersion: exportArchiveVersion,
    selectionCutoffAt: selection.selectionCutoffAt.toISOString(),
    consistency: "per_source_selection_cutoff_not_atomic_snapshot",
    recordKinds: [...exportSourceKinds],
    fileKinds: files ? ["post_media", "profile_avatar"] : [],
    trashPaths: ["trash/posts.ndjson", ...(files ? ["trash/media/posts/"] : [])],
  };
  yield { path: "manifest.json", chunks: (async function* () {
    yield encoder.encode(`${JSON.stringify(manifest)}\n`);
  })() };

  let count = 0;
  async function* records(kind: ExportSourceKind, trashOnly: boolean): AsyncGenerator<Uint8Array> {
    let after: string | null = null;
    for (;;) {
      const page = await source.page(selection, kind, after, EXPORT_PAGE_SIZE);
      if (page.length > EXPORT_PAGE_SIZE) throw new ExportZipLimitError("Export source returned too many rows.");
      if (page.length === 0) break;
      for (const item of page) {
        if (typeof item.record_key !== "string" || !item.record_key || item.record_key.length > 200
          || after !== null && item.record_key <= after) {
          throw new ExportZipLimitError("Export source cursor did not advance.");
        }
        after = item.record_key;
        if (kind === "posts") {
          const trashed = item.payload?.trashed_at !== null && item.payload?.trashed_at !== undefined;
          if (trashed !== trashOnly) continue;
        }
        count += 1;
        if (count > MAX_EXPORT_RECORDS) throw new ExportZipLimitError("Export record limit exceeded.");
        yield encodeBoundedRecord(item.payload);
      }
      if (page.length < EXPORT_PAGE_SIZE) break;
    }
  }
  for (const kind of exportSourceKinds) {
    yield { path: `records/${kind}.ndjson`, chunks: records(kind, false) };
  }
  yield { path: "trash/posts.ndjson", chunks: records("posts", true) };

  if (!files) return;
  let after: string | null = null;
  let fileCount = 0;
  const descriptions: Uint8Array[] = [];
  for (;;) {
    const page = await files.page(selection, after, 25);
    if (page.length > 25) throw new ExportZipLimitError("Export file source returned too many rows.");
    for (const file of page) {
      if (!file.file_id || file.file_id.length > 200 || after !== null && file.file_id <= after
        || !allowedContentTypes.includes(file.content_type as (typeof allowedContentTypes)[number])
        || !Number.isSafeInteger(file.byte_size) || file.byte_size < 0 || file.byte_size > MAX_EXPORT_ENTRY_BYTES) {
        throw new ExportZipLimitError("Export file reference is not reviewed or bounded.");
      }
      const prefix = file.file_kind === "post_media" ? "post:" : "avatar:";
      const id = file.file_id.startsWith(prefix) ? file.file_id.slice(prefix.length) : "";
      if (!/^[a-zA-Z0-9_-]{1,128}$/.test(id)
        || file.file_kind === "post_media" && (!file.post_id || !/^[a-zA-Z0-9_-]{1,128}$/.test(file.post_id))
        || file.file_kind === "profile_avatar" && (file.post_id !== null || file.post_trashed)
        || typeof file.post_trashed !== "boolean") {
        throw new ExportZipLimitError("Export file reference is not a reviewed attachment.");
      }
      after = file.file_id;
      fileCount += 1;
      if (fileCount > MAX_EXPORT_ENTRIES - exportSourceKinds.length - 3) {
        throw new ExportZipLimitError("Export file count exceeds its limit.");
      }
      const path = file.file_kind === "post_media"
        ? `${file.post_trashed ? "trash/" : ""}media/posts/${id}.bin` : `media/avatar/${id}.bin`;
      descriptions.push(encodeBoundedRecord({ path, kind: file.file_kind, postId: file.post_id,
        contentType: file.content_type, byteSize: file.byte_size }));
      yield { path, chunks: (async function* () {
        let readBytes = 0;
        for await (const chunk of files.read(selection, file)) {
          readBytes += chunk.byteLength;
          if (readBytes > file.byte_size) throw new ExportZipLimitError("Export file exceeds its authorized size.");
          yield chunk;
        }
        if (readBytes !== file.byte_size) throw new ExportZipLimitError("Export file is shorter than its authorized size.");
      })() };
    }
    if (page.length < 25) break;
  }
  yield { path: "files.ndjson", chunks: (async function* () { for (const row of descriptions) yield row; })() };
}
