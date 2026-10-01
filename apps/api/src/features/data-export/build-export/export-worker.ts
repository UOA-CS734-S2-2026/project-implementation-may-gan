export const exportArchiveVersion = 1;
export const exportPartBytes = 5 * 1024 * 1024;
export const exportMaximumBytes = 250 * 1024 * 1024;
export const exportMaximumParts = 50;

export interface ExportBuildJob {
  id: string;
  userId: string;
  lifecycleGeneration: number;
  leaseToken: string;
  snapshotCutoffAt: Date;
}
export interface ExportBuildStore {
  /** Claim atomically with a lease. The implementation must use SKIP LOCKED. */
  claim(now: Date): Promise<ExportBuildJob | null>;
  /** Inserts a durable cleanup ownership record before any object is created. */
  reserveObject(job: ExportBuildJob): Promise<string | null>;
  /** Must lock the lifecycle row and compare generation before publication. */
  publish(input: { job: ExportBuildJob; objectKey: string; snapshotCutoffAt: Date; readyAt: Date }): Promise<"published" | "stale">;
  /** A false result means the lease was stale, never that cleanup can be forgotten. */
  fail(input: { job: ExportBuildJob; category: "size_limit" | "storage" | "source" }): Promise<boolean>;
}
export interface ExportObjectStore {
  begin(key: string): Promise<{ uploadId: string }>;
  uploadPart(input: { key: string; uploadId: string; partNumber: number; bytes: Uint8Array }): Promise<{ etag: string }>;
  complete(input: { key: string; uploadId: string; parts: Array<{ partNumber: number; etag: string }> }): Promise<void>;
  abort(input: { key: string; uploadId: string }): Promise<void>;
  remove(key: string): Promise<void>;
}
export interface ExportSource {
  /** Every yielded record is a database-whitelisted projection bound to this lease. */
  records(job: ExportBuildJob): AsyncIterable<Record<string, unknown>>;
}

const encoder = new TextEncoder();
const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let bit = 0; bit < 8; bit += 1) c = (c & 1) ? 0xedb88320 ^ (c >>> 1) : c >>> 0;
  return c >>> 0;
});
function crc32(bytes: Uint8Array, previous = 0): number {
  let crc = previous ^ 0xffffffff;
  for (const byte of bytes) crc = crcTable[(crc ^ byte) & 0xff]! ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}
function u16(value: number) { return new Uint8Array([value & 255, value >>> 8 & 255]); }
function u32(value: number) { return new Uint8Array([value & 255, value >>> 8 & 255, value >>> 16 & 255, value >>> 24 & 255]); }
function concat(chunks: Uint8Array[]) { const result = new Uint8Array(chunks.reduce((n, chunk) => n + chunk.byteLength, 0)); let offset = 0; for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.byteLength; } return result; }
function localHeader(name: Uint8Array) { return concat([u32(0x04034b50), u16(20), u16(8), u16(0), u16(0), u16(0), u32(0), u32(0), u32(0), u16(name.byteLength), u16(0), name]); }
function descriptor(crc: number, size: number) { return concat([u32(0x08074b50), u32(crc), u32(size), u32(size)]); }
function centralHeader(name: Uint8Array, crc: number, size: number, offset: number) { return concat([u32(0x02014b50), u16(20), u16(8), u16(0), u16(0), u16(0), u32(crc), u32(size), u32(size), u16(name.byteLength), u16(0), u16(0), u16(0), u16(0), u32(0), u32(offset), name]); }
function endOfCentralDirectory(size: number, offset: number) { return concat([u32(0x06054b50), u16(0), u16(0), u16(1), u16(1), u32(size), u32(offset), u16(0)]); }

/** A bounded stored ZIP writer. At most one multipart part is held in memory. */
export async function buildExportArchive(input: { job: ExportBuildJob; store: ExportBuildStore; source: ExportSource; objects: ExportObjectStore; now: () => Date }): Promise<"published" | "stale" | "failed"> {
  const key = await input.store.reserveObject(input.job);
  if (!key) return "stale";
  let upload: { uploadId: string } | undefined;
  let category: "size_limit" | "storage" | "source" = "storage";
  try {
    upload = await input.objects.begin(key);
    const name = encoder.encode("data.ndjson");
    const header = localHeader(name);
    const pending: Uint8Array[] = [header];
    const parts: Array<{ partNumber: number; etag: string }> = [];
    let pendingBytes = header.byteLength;
    let archiveBytes = pendingBytes;
    let entryBytes = 0;
    let crc = 0;
    const flush = async (last = false) => {
      if (!last && pendingBytes < exportPartBytes) return;
      if (parts.length >= exportMaximumParts) throw new ExportLimitError();
      const bytes = concat(pending.splice(0));
      pendingBytes = 0;
      parts.push({ partNumber: parts.length + 1, etag: (await input.objects.uploadPart({ key, uploadId: upload!.uploadId, partNumber: parts.length + 1, bytes })).etag });
    };
    try {
      const manifest = { type: "manifest", archiveVersion: exportArchiveVersion, format: "ndjson", selectionCutoffAt: input.job.snapshotCutoffAt.toISOString(), sourceKinds: ["account_profile", "journal", "journal_revision", "private_note", "authored_message"] };
      const manifestBytes = encoder.encode(`${JSON.stringify(manifest)}\n`);
      entryBytes += manifestBytes.byteLength;
      archiveBytes += manifestBytes.byteLength;
      crc = crc32(manifestBytes, crc);
      pending.push(manifestBytes);
      pendingBytes += manifestBytes.byteLength;
      await flush();
      for await (const projection of input.source.records(input.job)) {
        const serialized = JSON.stringify(projection);
        // The source functions project bounded database columns. This additional
        // check prevents a malformed adapter from allocating an unbounded part.
        if (serialized.length > exportMaximumBytes) throw new ExportLimitError();
        const bytes = encoder.encode(`${serialized}\n`);
        entryBytes += bytes.byteLength;
        archiveBytes += bytes.byteLength;
        if (archiveBytes > exportMaximumBytes || entryBytes > 0xffffffff) throw new ExportLimitError();
        crc = crc32(bytes, crc);
        pending.push(bytes);
        pendingBytes += bytes.byteLength;
        await flush();
      }
    } catch (error) {
      category = error instanceof ExportLimitError ? "size_limit" : "source";
      throw error;
    }
    const centralOffset = header.byteLength + entryBytes + 16;
    const centralSize = 46 + name.byteLength;
    const trailer = concat([descriptor(crc, entryBytes), centralHeader(name, crc, entryBytes, 0), endOfCentralDirectory(centralSize, centralOffset)]);
    archiveBytes += trailer.byteLength;
    if (archiveBytes > exportMaximumBytes) throw new ExportLimitError();
    pending.push(trailer);
    pendingBytes += trailer.byteLength;
    await flush(true);
    await input.objects.complete({ key, uploadId: upload.uploadId, parts });
    const publication = await input.store.publish({ job: input.job, objectKey: key, snapshotCutoffAt: input.job.snapshotCutoffAt, readyAt: input.now() });
    if (publication === "stale") await input.objects.remove(key);
    return publication;
  } catch (error) {
    if (upload) {
      try { await input.objects.abort({ key, uploadId: upload.uploadId }); }
      catch { /* The reservation task remains durable for the cleanup dispatcher. */ }
    }
    await input.store.fail({ job: input.job, category: error instanceof ExportLimitError ? "size_limit" : category });
    return "failed";
  }
}

class ExportLimitError extends Error {}
