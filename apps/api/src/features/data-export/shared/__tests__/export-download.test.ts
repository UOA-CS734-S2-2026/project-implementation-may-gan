import { describe, expect, it, vi } from "vitest";
import { prepareExportDownload } from "../export-download";

const key = `private/data-exports/v2/${"a".repeat(64)}/${"b".repeat(64)}.zip`;

describe("fenced private ZIP download", () => {
  it("never fetches an archive for a missing or revoked session", async () => {
    const head = vi.fn(async () => ({ size: 1, etag: '"etag"' }));
    const readRange = vi.fn(async () => new Uint8Array([1]));
    const objects = { head, readRange };
    expect(await prepareExportDownload({ authorize: async () => null, objects })).toBeNull();
    expect(head).not.toHaveBeenCalled();
    let calls = 0;
    expect(await prepareExportDownload({ authorize: async () => ++calls === 1 ? key : null, objects })).toBeNull();
    expect(readRange).not.toHaveBeenCalled();
  });

  it("checks authorization before every bounded chunk and fails a revoked stream", async () => {
    let allowed = true;
    const readRange = vi.fn(async (_key: string, start: number, end: number) => new Uint8Array(end - start + 1));
    const download = await prepareExportDownload({
      authorize: async () => allowed ? key : null,
      objects: { head: async () => ({ size: 600_000, etag: '"etag"' }), readRange },
    });
    expect(download?.size).toBe(600_000);
    const reader = download!.body.getReader();
    expect((await reader.read()).value?.byteLength).toBe(512 * 1024);
    allowed = false;
    await expect(reader.read()).rejects.toThrow(/interrupted/);
    expect(readRange).toHaveBeenCalledTimes(1);
  });

  it("streams a complete archive without buffering it in the route", async () => {
    const download = await prepareExportDownload({
      authorize: async () => key,
      objects: { head: async () => ({ size: 3, etag: '"etag"' }),
        readRange: async () => new Uint8Array([80, 75, 3]) },
    });
    const response = new Response(download!.body);
    expect(Array.from(new Uint8Array(await response.arrayBuffer()))).toEqual([80, 75, 3]);
  });
});
