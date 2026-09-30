import { describe, expect, it } from "vitest";
import { createR2ExportArchiveReader } from "./export-archive-reader";

describe("R2 export archive reader", () => {
  it("uses bounded ranges instead of a whole-object read", async () => {
    const ranges: Array<{ start: number; end: number }> = [];
    const reader = createR2ExportArchiveReader({
      head: async () => ({ outcome: "found", contentLength: 1_048_578 }),
      readRange: async (_key, range) => { ranges.push(range); return { outcome: "read", bytes: new Uint8Array(range.end - range.start + 1) }; },
    });
    const stream = await reader.open("opaque");
    expect(stream).not.toBeNull();
    await new Response(stream).arrayBuffer();
    expect(ranges).toEqual([{ start: 0, end: 1_048_575 }, { start: 1_048_576, end: 1_048_577 }]);
  });
});
