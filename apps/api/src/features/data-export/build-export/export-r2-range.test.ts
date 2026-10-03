import { describe, expect, it, vi } from "vitest";
import { createExportR2RangeReader } from "./export-r2-range";

const config = { accountId: "test", bucketName: "private", accessKeyId: "key", secretAccessKey: "secret" };
const bytes = new TextEncoder();
function fake(response: Response) {
  const fetch = vi.fn(async () => response);
  return { reader: createExportR2RangeReader(config, { fetch: fetch as never }), fetch };
}

describe("bounded export R2 ranges", () => {
  it("accepts an exact partial response for an approved owned key", async () => {
    const { reader, fetch } = fake(new Response(bytes.encode("hello"), {
      status: 206, headers: { "content-range": "bytes 0-4/5", etag: "fixed-etag" },
    }));
    expect(new TextDecoder().decode((await reader.read("media/owner/file_1", 0, 4, 5)).bytes)).toBe("hello");
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining("/private/media/owner/file_1"),
      expect.objectContaining({ headers: { Range: "bytes=0-4" } }));
  });

  it("rejects unreviewed keys, full-body replies, and mismatched ranges", async () => {
    const { reader, fetch } = fake(new Response("hello", { status: 200 }));
    await expect(reader.read("private/unreviewed/archive", 0, 4, 5)).rejects.toThrow();
    expect(fetch).not.toHaveBeenCalled();
    await expect(reader.read("media/owner/file_1", 0, 4, 5)).rejects.toThrow(/invalid export range/);
    const wrong = fake(new Response("hello", { status: 206, headers: { "content-range": "bytes 1-5/6", etag: "etag" } }));
    await expect(wrong.reader.read("media/owner/file_1", 0, 4, 5)).rejects.toThrow(/invalid export range/);
  });

  it("stops a provider stream as soon as it exceeds the requested size", async () => {
    let cancelled = false;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) { controller.enqueue(bytes.encode("unexpected extra bytes")); },
      cancel() { cancelled = true; },
    });
    const { reader } = fake(new Response(stream, { status: 206, headers: { "content-range": "bytes 0-4/5", etag: "etag" } }));
    await expect(reader.read("media/owner/file_1", 0, 4, 5)).rejects.toThrow(/exceeded its authorized size/);
    expect(cancelled).toBe(true);
  });
});
