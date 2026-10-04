import { describe, expect, it } from "vitest";
import { ExportZipLimitError, MAX_EXPORT_CHUNK_BYTES, streamExportZip, type ExportZipEntry } from "../zip-stream";

const encoder = new TextEncoder();
const decoder = new TextDecoder();
async function* bytes(value: string): AsyncGenerator<Uint8Array> { yield encoder.encode(value); }
async function* entries(...items: Array<[string, string]>): AsyncGenerator<ExportZipEntry> {
  for (const [path, content] of items) yield { path, chunks: bytes(content) };
}
async function collect(source: AsyncIterable<Uint8Array>): Promise<Uint8Array> {
  const parts: Uint8Array[] = [];
  let total = 0;
  for await (const part of source) { parts.push(part); total += part.length; }
  const result = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) { result.set(part, offset); offset += part.length; }
  return result;
}

describe("bounded stored ZIP stream", () => {
  it("writes valid local headers, checksums, directory offsets, and separate entries", async () => {
    const zip = await collect(streamExportZip(entries(
      ["manifest.json", "hello"], ["records/posts.ndjson", "world"],
    )));
    const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
    const end = zip.length - 22;
    expect(view.getUint32(end, true)).toBe(0x06054b50);
    expect(view.getUint16(end + 10, true)).toBe(2);
    const directoryStart = view.getUint32(end + 16, true);
    let central = directoryStart;
    for (const [name, value, checksum] of [
      ["manifest.json", "hello", 0x3610a686],
      ["records/posts.ndjson", "world", 0x3a771143],
    ] as const) {
      expect(view.getUint32(central, true)).toBe(0x02014b50);
      expect(view.getUint32(central + 16, true)).toBe(checksum);
      expect(view.getUint32(central + 24, true)).toBe(value.length);
      const nameBytes = view.getUint16(central + 28, true);
      expect(decoder.decode(zip.subarray(central + 46, central + 46 + nameBytes))).toBe(name);
      const local = view.getUint32(central + 42, true);
      expect(view.getUint32(local, true)).toBe(0x04034b50);
      const body = local + 30 + view.getUint16(local + 26, true);
      expect(decoder.decode(zip.subarray(body, body + value.length))).toBe(value);
      expect(view.getUint32(body + value.length, true)).toBe(0x08074b50);
      central += 46 + nameBytes;
    }
    expect(central).toBe(end);
  });

  it("rejects path traversal, duplicate files, and oversized chunks", async () => {
    await expect(collect(streamExportZip(entries(["../secrets", "bad"])))).rejects.toBeInstanceOf(ExportZipLimitError);
    await expect(collect(streamExportZip(entries(["manifest.json", "a"], ["manifest.json", "b"]))))
      .rejects.toBeInstanceOf(ExportZipLimitError);
    async function* large(): AsyncGenerator<ExportZipEntry> {
      yield { path: "media/file", chunks: (async function* () { yield new Uint8Array(MAX_EXPORT_CHUNK_BYTES + 1); })() };
    }
    await expect(collect(streamExportZip(large()))).rejects.toBeInstanceOf(ExportZipLimitError);
  });
});
