import { MAX_EXPORT_ARCHIVE_BYTES } from "../shared/export-limits";

export { MAX_EXPORT_ARCHIVE_BYTES } from "../shared/export-limits";
const text = new TextEncoder();
export const MAX_EXPORT_ENTRY_BYTES = 200 * 1024 * 1024;
export const MAX_EXPORT_CHUNK_BYTES = 1024 * 1024;
export const MAX_EXPORT_ENTRIES = 5_000;

export interface ExportZipEntry {
  path: string;
  chunks: AsyncIterable<Uint8Array>;
}

const crcTable = Array.from({ length: 256 }, (_, index) => {
  let result = index;
  for (let bit = 0; bit < 8; bit += 1) result = (result & 1) ? 0xedb88320 ^ (result >>> 1) : result >>> 1;
  return result >>> 0;
});
function crc32(bytes: Uint8Array, previous: number): number {
  let value = previous ^ 0xffffffff;
  for (const byte of bytes) value = crcTable[(value ^ byte) & 255]! ^ (value >>> 8);
  return (value ^ 0xffffffff) >>> 0;
}
function u16(value: number): Uint8Array {
  return new Uint8Array([value & 255, (value >>> 8) & 255]);
}
function u32(value: number): Uint8Array {
  return new Uint8Array([value & 255, (value >>> 8) & 255, (value >>> 16) & 255, (value >>> 24) & 255]);
}
function join(parts: readonly Uint8Array[]): Uint8Array {
  const result = new Uint8Array(parts.reduce((total, part) => total + part.byteLength, 0));
  let offset = 0;
  for (const part of parts) { result.set(part, offset); offset += part.byteLength; }
  return result;
}
function localHeader(name: Uint8Array) {
  return join([u32(0x04034b50), u16(20), u16(0x808), u16(0), u16(0), u16(0),
    u32(0), u32(0), u32(0), u16(name.byteLength), u16(0), name]);
}
function descriptor(crc: number, size: number) {
  return join([u32(0x08074b50), u32(crc), u32(size), u32(size)]);
}
function centralHeader(name: Uint8Array, crc: number, size: number, offset: number) {
  return join([u32(0x02014b50), u16(20), u16(20), u16(0x808), u16(0), u16(0), u16(0),
    u32(crc), u32(size), u32(size), u16(name.byteLength), u16(0), u16(0), u16(0),
    u16(0), u32(0), u32(offset), name]);
}
function directoryEnd(entries: number, directoryBytes: number, offset: number) {
  return join([u32(0x06054b50), u16(0), u16(0), u16(entries), u16(entries),
    u32(directoryBytes), u32(offset), u16(0)]);
}

export class ExportZipLimitError extends Error {}

/** Produces stored ZIP entries with data descriptors, never buffering file content. */
export async function* streamExportZip(entries: AsyncIterable<ExportZipEntry>): AsyncGenerator<Uint8Array> {
  let total = 0;
  const directory: Uint8Array[] = [];
  const names = new Set<string>();
  const emitSize = (size: number) => {
    total += size;
    if (total > MAX_EXPORT_ARCHIVE_BYTES) throw new ExportZipLimitError("Export archive exceeds its byte limit.");
  };
  for await (const entry of entries) {
    if (directory.length >= MAX_EXPORT_ENTRIES) throw new ExportZipLimitError("Too many export files.");
    if (entry.path.startsWith("/") || entry.path.includes("..") || !/^[a-zA-Z0-9._/-]+$/.test(entry.path)
      || names.has(entry.path)) throw new ExportZipLimitError("Unsafe or repeated export file path.");
    names.add(entry.path);
    const name = text.encode(entry.path);
    if (name.byteLength > 200) throw new ExportZipLimitError("Export file path is too long.");
    const offset = total;
    const header = localHeader(name);
    emitSize(header.byteLength);
    yield header;
    let size = 0;
    let crc = 0;
    for await (const chunk of entry.chunks) {
      if (!(chunk instanceof Uint8Array) || chunk.byteLength > MAX_EXPORT_CHUNK_BYTES) {
        throw new ExportZipLimitError("Export input chunk exceeds its byte limit.");
      }
      size += chunk.byteLength;
      if (size > MAX_EXPORT_ENTRY_BYTES) throw new ExportZipLimitError("Export file exceeds its byte limit.");
      emitSize(chunk.byteLength);
      crc = crc32(chunk, crc);
      yield chunk;
    }
    const tail = descriptor(crc, size);
    emitSize(tail.byteLength);
    yield tail;
    directory.push(centralHeader(name, crc, size, offset));
  }
  const directoryOffset = total;
  let directorySize = 0;
  for (const record of directory) {
    emitSize(record.byteLength);
    directorySize += record.byteLength;
    yield record;
  }
  const end = directoryEnd(directory.length, directorySize, directoryOffset);
  emitSize(end.byteLength);
  yield end;
}
