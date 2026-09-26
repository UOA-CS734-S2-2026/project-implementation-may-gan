import { describe, expect, it } from "vitest";
import {
  buildFtypBox,
  buildMinimalMp4,
  buildMoovBox,
  buildMvhdBoxV0,
  buildMvhdBoxV1,
  concatBoxes,
  validJpegBytes,
  wrapBox,
} from "./media-format.fixtures";
import {
  checkMagicBytes,
  extractIsoBmffDurationSeconds,
  readMagicByteWindow,
  type BoxSource,
  type RangeReader,
} from "./media-format";

function boxSourceFor(buffer: Uint8Array): BoxSource {
  return {
    fileSize: buffer.byteLength,
    async readRange(start, end) {
      if (start < 0 || end < start || end >= buffer.byteLength) return undefined;
      return buffer.slice(start, end + 1);
    },
  };
}

function rangeReaderFor(buffer: Uint8Array): RangeReader {
  return async (start, end) => {
    if (start < 0 || end < start || end >= buffer.byteLength) return undefined;
    return buffer.slice(start, end + 1);
  };
}

describe("checkMagicBytes", () => {
  it("matches a real JPEG and rejects random bytes", () => {
    expect(checkMagicBytes("image/jpeg", validJpegBytes)).toBe("match");
    expect(checkMagicBytes("image/jpeg", new Uint8Array([0, 1, 2, 3]))).toBe("mismatch");
  });

  it("matches a real PNG signature", () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);
    expect(checkMagicBytes("image/png", png)).toBe("match");
    expect(checkMagicBytes("image/png", validJpegBytes)).toBe("mismatch");
  });

  it("matches a real WEBP signature (RIFF....WEBP)", () => {
    const webp = new Uint8Array(16);
    webp.set([0x52, 0x49, 0x46, 0x46], 0); // "RIFF"
    webp.set([0, 0, 0, 0], 4); // file size, ignored
    webp.set([0x57, 0x45, 0x42, 0x50], 8); // "WEBP"
    expect(checkMagicBytes("image/webp", webp)).toBe("match");
    expect(checkMagicBytes("image/webp", validJpegBytes)).toBe("mismatch");
  });

  it("matches HEIC via major brand and via a compatible brand", () => {
    const majorHeic = buildFtypBox("heic", ["mif1"]);
    expect(checkMagicBytes("image/heic", majorHeic)).toBe("match");

    const compatibleHeic = buildFtypBox("mp42", ["mif1", "heic"]);
    expect(checkMagicBytes("image/heic", compatibleHeic)).toBe("match");

    const notHeic = buildFtypBox("isom", ["isom"]);
    expect(checkMagicBytes("image/heic", notHeic)).toBe("mismatch");
  });

  it("matches MP4 by excluding QuickTime and HEIC brands", () => {
    expect(checkMagicBytes("video/mp4", buildFtypBox("isom", ["isom", "mp42"]))).toBe("match");
    expect(checkMagicBytes("video/mp4", buildFtypBox("qt  "))).toBe("mismatch");
    expect(checkMagicBytes("video/mp4", buildFtypBox("heic", ["mif1"]))).toBe("mismatch");
    expect(checkMagicBytes("video/mp4", validJpegBytes)).toBe("mismatch");
  });

  it("matches QuickTime via the qt brand, and via legacy pre-ftyp box types", () => {
    expect(checkMagicBytes("video/quicktime", buildFtypBox("qt  "))).toBe("match");
    expect(checkMagicBytes("video/quicktime", buildFtypBox("isom", ["isom"]))).toBe("mismatch");

    const legacyMoov = wrapBox("moov", new Uint8Array(4));
    expect(checkMagicBytes("video/quicktime", legacyMoov)).toBe("match");
    const legacyJunk = wrapBox("stco", new Uint8Array(4)); // not a recognised legacy top-level box
    expect(checkMagicBytes("video/quicktime", legacyJunk)).toBe("mismatch");
  });
});

describe("readMagicByteWindow", () => {
  it("returns the initial probe window when the file is small", async () => {
    const window = await readMagicByteWindow(rangeReaderFor(validJpegBytes), validJpegBytes.byteLength);
    expect(window).toEqual(validJpegBytes);
  });

  it("fetches a follow-up read when a real ftyp box is bigger than the initial probe", async () => {
    const manyBrands = Array.from({ length: 20 }, (_, index) => `br${index}`.padEnd(4, "x"));
    const ftyp = buildFtypBox("isom", manyBrands); // 16 + 20*4 = 96 bytes, bigger than the 64-byte initial probe
    expect(ftyp.byteLength).toBeGreaterThan(64);

    const window = await readMagicByteWindow(rangeReaderFor(ftyp), ftyp.byteLength, 64);
    expect(window).toEqual(ftyp);
  });

  it("fails closed when a declared ftyp size exceeds the follow-up budget", async () => {
    const box = new Uint8Array(64);
    box[0] = 0; box[1] = 0; box[2] = 0x10; box[3] = 0x00; // declared size = 4096, way over the 512-byte cap
    box.set([0x66, 0x74, 0x79, 0x70], 4); // "ftyp"

    const window = await readMagicByteWindow(rangeReaderFor(box), 4096, 64, 512);
    expect(window).toBeUndefined();
  });

  it("fails closed when the underlying read fails", async () => {
    const window = await readMagicByteWindow(async () => undefined, 100);
    expect(window).toBeUndefined();
  });
});

describe("extractIsoBmffDurationSeconds", () => {
  it("extracts a correct duration from a v0 mvhd box", async () => {
    const file = buildMinimalMp4(5, 1000);
    const result = await extractIsoBmffDurationSeconds(boxSourceFor(file));
    expect(result).toEqual({ outcome: "duration", seconds: 5 });
  });

  it("extracts a correct duration from a v1 (64-bit) mvhd box", async () => {
    const ftyp = buildFtypBox("isom", ["isom"]);
    const mvhd = buildMvhdBoxV1({ timescale: 1000, duration: 10_500 });
    const file = concatBoxes(ftyp, buildMoovBox([mvhd]));

    const result = await extractIsoBmffDurationSeconds(boxSourceFor(file));
    expect(result).toEqual({ outcome: "duration", seconds: 10.5 });
  });

  it("skips unrelated top-level boxes (free/wide) before finding moov", async () => {
    const ftyp = buildFtypBox("isom", ["isom"]);
    const free = wrapBox("free", new Uint8Array(12));
    const wide = wrapBox("wide", new Uint8Array(4));
    const mvhd = buildMvhdBoxV0({ timescale: 600, duration: 1200 });
    const file = concatBoxes(ftyp, free, wide, buildMoovBox([mvhd]));

    const result = await extractIsoBmffDurationSeconds(boxSourceFor(file));
    expect(result).toEqual({ outcome: "duration", seconds: 2 });
  });

  it("is malformed when moov is never found", async () => {
    const file = buildFtypBox("isom", ["isom"]);
    const result = await extractIsoBmffDurationSeconds(boxSourceFor(file));
    expect(result).toEqual({ outcome: "malformed" });
  });

  it("is malformed when moov exists but has no mvhd child", async () => {
    const ftyp = buildFtypBox("isom", ["isom"]);
    const unrelatedChild = wrapBox("trak", new Uint8Array(4));
    const file = concatBoxes(ftyp, buildMoovBox([unrelatedChild]));

    const result = await extractIsoBmffDurationSeconds(boxSourceFor(file));
    expect(result).toEqual({ outcome: "malformed" });
  });

  it("is malformed when a box's declared size overruns the real file size", async () => {
    const box = new Uint8Array(16);
    box[3] = 0xff; // declared size 255, far bigger than this 16-byte buffer
    box.set([0x6d, 0x6f, 0x6f, 0x76], 4); // "moov"

    const result = await extractIsoBmffDurationSeconds(boxSourceFor(box));
    expect(result).toEqual({ outcome: "malformed" });
  });

  it("is malformed when mvhd has a zero timescale", async () => {
    const ftyp = buildFtypBox("isom", ["isom"]);
    const mvhd = buildMvhdBoxV0({ timescale: 0, duration: 100 });
    const file = concatBoxes(ftyp, buildMoovBox([mvhd]));

    const result = await extractIsoBmffDurationSeconds(boxSourceFor(file));
    expect(result).toEqual({ outcome: "malformed" });
  });

  it("is malformed when the box tree exceeds the walk budget before finding moov", async () => {
    const ftyp = buildFtypBox("isom", ["isom"]);
    const manyFreeBoxes = Array.from({ length: 80 }, () => wrapBox("free", new Uint8Array(0)));
    const mvhd = buildMvhdBoxV0({ timescale: 1000, duration: 1000 });
    const file = concatBoxes(ftyp, ...manyFreeBoxes, buildMoovBox([mvhd]));

    const result = await extractIsoBmffDurationSeconds(boxSourceFor(file), {
      maxBoxesWalked: 64,
      maxTotalBytesRead: 256 * 1024,
    });
    expect(result).toEqual({ outcome: "malformed" });
  });

  it("is malformed when a read fails partway through", async () => {
    const ftyp = buildFtypBox("isom", ["isom"]);
    const mvhd = buildMvhdBoxV0({ timescale: 1000, duration: 1000 });
    const file = concatBoxes(ftyp, buildMoovBox([mvhd]));

    const flakySource: BoxSource = {
      fileSize: file.byteLength,
      async readRange(start, end) {
        if (start >= ftyp.byteLength) return undefined; // fail once we reach moov
        return file.slice(start, end + 1);
      },
    };
    const result = await extractIsoBmffDurationSeconds(flakySource);
    expect(result).toEqual({ outcome: "malformed" });
  });
});
