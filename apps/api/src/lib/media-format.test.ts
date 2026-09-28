import { describe, expect, it } from "vitest";
import {
  buildFtypBox,
  buildMinimalMp4,
  buildMoovBox,
  buildMvhdBoxV0,
  buildMvhdBoxV1,
  buildTrakBox,
  concatBoxes,
  validJpegBytes,
  wrapBox,
} from "./media-format.fixtures";
import {
  checkEssentialStructure,
  checkMagicBytes,
  extractIsoBmffDurationSeconds,
  readMagicByteWindow,
  type BoxSource,
  type RangeReader,
} from "./media-format";

function asciiBytes(text: string): number[] {
  return Array.from(text, (char) => char.charCodeAt(0));
}

function writeUint32LE(bytes: Uint8Array, offset: number, value: number): void {
  bytes[offset] = value & 0xff;
  bytes[offset + 1] = (value >>> 8) & 0xff;
  bytes[offset + 2] = (value >>> 16) & 0xff;
  bytes[offset + 3] = (value >>> 24) & 0xff;
}

function webpLikeBytes(options: {
  chunkId: string;
  payload?: number[];
  riffSizeOverride?: number;
  chunkSizeOverride?: number;
}): Uint8Array {
  const payload = options.payload ?? [];
  const bytes = new Uint8Array(20 + payload.length);
  bytes.set(asciiBytes("RIFF"), 0);
  writeUint32LE(bytes, 4, options.riffSizeOverride ?? bytes.byteLength - 8);
  bytes.set(asciiBytes("WEBP"), 8);
  bytes.set(asciiBytes(options.chunkId), 12);
  writeUint32LE(bytes, 16, options.chunkSizeOverride ?? payload.length);
  bytes.set(payload, 20);
  return bytes;
}

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

describe("checkEssentialStructure", () => {
  it("requires a real JPEG EOI marker — a payload that only starts with the SOI marker doesn't have one", async () => {
    expect(await checkEssentialStructure("image/jpeg", validJpegBytes, boxSourceFor(validJpegBytes))).toBe("match");

    const noEoi = validJpegBytes.slice(0, validJpegBytes.byteLength - 2);
    expect(await checkEssentialStructure("image/jpeg", noEoi, boxSourceFor(noEoi))).toBe("mismatch");
  });

  it("requires a real PNG's first chunk to be IHDR and its last to be IEND", async () => {
    function pngLikeBytes(firstChunkType: string, lastChunkType: string): Uint8Array {
      const bytes = new Uint8Array(32);
      bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0); // signature
      bytes.set(asciiBytes(firstChunkType), 12); // first chunk's type field
      bytes.set(asciiBytes(lastChunkType), bytes.byteLength - 8); // trailing chunk's type field
      return bytes;
    }

    const valid = pngLikeBytes("IHDR", "IEND");
    expect(await checkEssentialStructure("image/png", valid, boxSourceFor(valid))).toBe("match");

    const wrongFirstChunk = pngLikeBytes("junk", "IEND");
    expect(await checkEssentialStructure("image/png", wrongFirstChunk, boxSourceFor(wrongFirstChunk))).toBe(
      "mismatch",
    );

    const missingIend = pngLikeBytes("IHDR", "junk");
    expect(await checkEssentialStructure("image/png", missingIend, boxSourceFor(missingIend))).toBe("mismatch");
  });

  it("requires a real VP8L bitstream signature, not just the chunk id, after the RIFF/WEBP header", async () => {
    const valid = webpLikeBytes({ chunkId: "VP8L", payload: [0x2f, 0x00, 0x00, 0x00] });
    expect(await checkEssentialStructure("image/webp", valid, boxSourceFor(valid))).toBe("match");

    // Exactly the case that used to slip through: RIFF, WEBP, and VP8L all sit in
    // the expected positions, but the file is 16 bytes — too short to even reach
    // where a real signature byte or chunk size would be — so there's no image
    // data behind the chunk id at all.
    const noRealPayload = new Uint8Array(16);
    noRealPayload.set(asciiBytes("RIFF"), 0);
    noRealPayload.set(asciiBytes("WEBP"), 8);
    noRealPayload.set(asciiBytes("VP8L"), 12);
    expect(await checkEssentialStructure("image/webp", noRealPayload, boxSourceFor(noRealPayload))).toBe(
      "mismatch",
    );

    const wrongSignatureByte = webpLikeBytes({ chunkId: "VP8L", payload: [0x00, 0x00, 0x00, 0x00] });
    expect(
      await checkEssentialStructure("image/webp", wrongSignatureByte, boxSourceFor(wrongSignatureByte)),
    ).toBe("mismatch");
  });

  it("requires a real VP8 (lossy) key-frame start code after its 3-byte frame tag", async () => {
    const valid = webpLikeBytes({ chunkId: "VP8 ", payload: [0x00, 0x00, 0x00, 0x9d, 0x01, 0x2a] });
    expect(await checkEssentialStructure("image/webp", valid, boxSourceFor(valid))).toBe("match");

    const wrongStartCode = webpLikeBytes({ chunkId: "VP8 ", payload: [0x00, 0x00, 0x00, 0x00, 0x00, 0x00] });
    expect(await checkEssentialStructure("image/webp", wrongStartCode, boxSourceFor(wrongStartCode))).toBe(
      "mismatch",
    );
  });

  it("requires VP8X's declared chunk size to match its fixed 10-byte body", async () => {
    const valid = webpLikeBytes({ chunkId: "VP8X", payload: new Array(10).fill(0) });
    expect(await checkEssentialStructure("image/webp", valid, boxSourceFor(valid))).toBe("match");

    const wrongSize = webpLikeBytes({ chunkId: "VP8X", payload: new Array(10).fill(0), chunkSizeOverride: 4 });
    expect(await checkEssentialStructure("image/webp", wrongSize, boxSourceFor(wrongSize))).toBe("mismatch");
  });

  it("requires RIFF's declared container size to match the real file size", async () => {
    const mismatched = webpLikeBytes({
      chunkId: "VP8L",
      payload: [0x2f, 0x00, 0x00, 0x00],
      riffSizeOverride: 4,
    });
    expect(await checkEssentialStructure("image/webp", mismatched, boxSourceFor(mismatched))).toBe("mismatch");
  });

  it("requires a chunk's declared size to fit within the real file, and to be non-zero", async () => {
    const overrunsFile = webpLikeBytes({
      chunkId: "VP8L",
      payload: [0x2f, 0x00, 0x00, 0x00],
      chunkSizeOverride: 4096,
    });
    expect(await checkEssentialStructure("image/webp", overrunsFile, boxSourceFor(overrunsFile))).toBe(
      "mismatch",
    );

    const zeroSize = webpLikeBytes({ chunkId: "VP8L", payload: [0x2f, 0x00, 0x00, 0x00], chunkSizeOverride: 0 });
    expect(await checkEssentialStructure("image/webp", zeroSize, boxSourceFor(zeroSize))).toBe("mismatch");
  });

  it("requires a real HEIC to have a meta box — a matching ftyp brand alone isn't enough", async () => {
    const ftyp = buildFtypBox("heic", ["mif1"]);
    const meta = wrapBox("meta", new Uint8Array(4));
    const withMeta = concatBoxes(ftyp, meta);
    expect(await checkEssentialStructure("image/heic", ftyp, boxSourceFor(withMeta))).toBe("match");
    expect(await checkEssentialStructure("image/heic", ftyp, boxSourceFor(ftyp))).toBe("mismatch");
  });

  it("propagates a non-budget error from the HEIC meta-box walk (e.g. an R2 outage) instead of treating it as a mismatch", async () => {
    const boom = new Error("simulated R2 outage");
    const throwingSource: BoxSource = {
      fileSize: 100,
      async readRange() {
        throw boom;
      },
    };
    await expect(checkEssentialStructure("image/heic", new Uint8Array(20), throwingSource)).rejects.toBe(boom);
  });

  it("defers video/mp4 and video/quicktime to extractIsoBmffDurationSeconds's own trak/mdat check", async () => {
    const anything = new Uint8Array([1, 2, 3]);
    expect(await checkEssentialStructure("video/mp4", anything, boxSourceFor(anything))).toBe("match");
    expect(await checkEssentialStructure("video/quicktime", anything, boxSourceFor(anything))).toBe("match");
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
    const trak = buildTrakBox({ timescale: 1000, duration: 10_500 });
    const mdat = wrapBox("mdat", new Uint8Array([0, 1, 2, 3]));
    const file = concatBoxes(ftyp, buildMoovBox([mvhd, trak]), mdat);

    const result = await extractIsoBmffDurationSeconds(boxSourceFor(file));
    expect(result).toEqual({ outcome: "duration", seconds: 10.5 });
  });

  it("skips unrelated top-level boxes (free/wide) before finding moov", async () => {
    const ftyp = buildFtypBox("isom", ["isom"]);
    const free = wrapBox("free", new Uint8Array(12));
    const wide = wrapBox("wide", new Uint8Array(4));
    const mvhd = buildMvhdBoxV0({ timescale: 600, duration: 1200 });
    const trak = buildTrakBox({ timescale: 600, duration: 1200 });
    const mdat = wrapBox("mdat", new Uint8Array([0, 1, 2, 3]));
    const file = concatBoxes(ftyp, free, wide, buildMoovBox([mvhd, trak]), mdat);

    const result = await extractIsoBmffDurationSeconds(boxSourceFor(file));
    expect(result).toEqual({ outcome: "duration", seconds: 2 });
  });

  it("is malformed when trak has no mdia/mdhd — an empty placeholder track, not a real one", async () => {
    const ftyp = buildFtypBox("isom", ["isom"]);
    const mvhd = buildMvhdBoxV0({ timescale: 1000, duration: 5000 });
    const emptyTrak = wrapBox("trak", new Uint8Array(4)); // reviewer's exact example: empty trak
    const mdat = wrapBox("mdat", new Uint8Array([0, 1, 2, 3])); // and 4 arbitrary bytes in mdat
    const file = concatBoxes(ftyp, buildMoovBox([mvhd, emptyTrak]), mdat);

    const result = await extractIsoBmffDurationSeconds(boxSourceFor(file));
    expect(result).toEqual({ outcome: "malformed" });
  });

  it("is malformed when the track's own mdhd duration disagrees with mvhd's beyond tolerance", async () => {
    const ftyp = buildFtypBox("isom", ["isom"]);
    // mvhd declares 5s, but the track's own media header declares 900s — mvhd's
    // duration alone (what the old check trusted) would have passed the 15s cap.
    const mvhd = buildMvhdBoxV0({ timescale: 1000, duration: 5000 });
    const trak = buildTrakBox({ timescale: 1000, duration: 900_000 });
    const mdat = wrapBox("mdat", new Uint8Array([0, 1, 2, 3]));
    const file = concatBoxes(ftyp, buildMoovBox([mvhd, trak]), mdat);

    const result = await extractIsoBmffDurationSeconds(boxSourceFor(file));
    expect(result).toEqual({ outcome: "malformed" });
  });

  it("cross-checks against the video track even when an audio track with a divergent duration comes first", async () => {
    const ftyp = buildFtypBox("isom", ["isom"]);
    const mvhd = buildMvhdBoxV0({ timescale: 1000, duration: 10_000 });
    // Audio trails the video by 3s — legitimately outside the 5%/1s tolerance
    // against mvhd, and listed first. It must not cause a false rejection.
    const audio = buildTrakBox({ timescale: 44_100, duration: 13 * 44_100, handlerType: "soun" });
    const video = buildTrakBox({ timescale: 600, duration: 6000 });
    const mdat = wrapBox("mdat", new Uint8Array([0, 1, 2, 3]));
    const file = concatBoxes(ftyp, buildMoovBox([mvhd, audio, video]), mdat);

    const result = await extractIsoBmffDurationSeconds(boxSourceFor(file));
    expect(result).toEqual({ outcome: "duration", seconds: 10 });
  });

  it("is malformed when no track is a video track, even if its duration agrees with mvhd", async () => {
    const ftyp = buildFtypBox("isom", ["isom"]);
    const mvhd = buildMvhdBoxV0({ timescale: 1000, duration: 5000 });
    const audioOnly = buildTrakBox({ timescale: 1000, duration: 5000, handlerType: "soun" });
    const mdat = wrapBox("mdat", new Uint8Array([0, 1, 2, 3]));
    const file = concatBoxes(ftyp, buildMoovBox([mvhd, audioOnly]), mdat);

    const result = await extractIsoBmffDurationSeconds(boxSourceFor(file));
    expect(result).toEqual({ outcome: "malformed" });
  });

  it("uses the larger of mvhd's and mdhd's durations when they agree within tolerance", async () => {
    const ftyp = buildFtypBox("isom", ["isom"]);
    // 1% apart (well within the 5%-or-1s tolerance) — real rounding across two
    // independent timescales, not a fabrication.
    const mvhd = buildMvhdBoxV0({ timescale: 1000, duration: 10_000 });
    const trak = buildTrakBox({ timescale: 1000, duration: 10_050 });
    const mdat = wrapBox("mdat", new Uint8Array([0, 1, 2, 3]));
    const file = concatBoxes(ftyp, buildMoovBox([mvhd, trak]), mdat);

    const result = await extractIsoBmffDurationSeconds(boxSourceFor(file));
    expect(result).toEqual({ outcome: "duration", seconds: 10.05 });
  });

  it("is malformed when moov has an mvhd but no trak — no real track at all", async () => {
    const ftyp = buildFtypBox("isom", ["isom"]);
    const mvhd = buildMvhdBoxV0({ timescale: 1000, duration: 1000 });
    const mdat = wrapBox("mdat", new Uint8Array([0, 1, 2, 3]));
    const file = concatBoxes(ftyp, buildMoovBox([mvhd]), mdat); // no trak

    const result = await extractIsoBmffDurationSeconds(boxSourceFor(file));
    expect(result).toEqual({ outcome: "malformed" });
  });

  it("is malformed when mdat is missing or empty — no real media payload", async () => {
    const ftyp = buildFtypBox("isom", ["isom"]);
    const mvhd = buildMvhdBoxV0({ timescale: 1000, duration: 1000 });
    const trak = wrapBox("trak", new Uint8Array(4));

    const withoutMdat = concatBoxes(ftyp, buildMoovBox([mvhd, trak]));
    expect(await extractIsoBmffDurationSeconds(boxSourceFor(withoutMdat))).toEqual({ outcome: "malformed" });

    const emptyMdat = wrapBox("mdat", new Uint8Array(0));
    const withEmptyMdat = concatBoxes(ftyp, buildMoovBox([mvhd, trak]), emptyMdat);
    expect(await extractIsoBmffDurationSeconds(boxSourceFor(withEmptyMdat))).toEqual({ outcome: "malformed" });
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
    const trak = buildTrakBox({ timescale: 1000, duration: 100 });
    const mdat = wrapBox("mdat", new Uint8Array([0, 1, 2, 3]));
    const file = concatBoxes(ftyp, buildMoovBox([mvhd, trak]), mdat);

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

  it("propagates a non-budget error (e.g. an R2 outage) instead of treating it as malformed", async () => {
    const boom = new Error("simulated R2 outage");
    const throwingSource: BoxSource = {
      fileSize: 100,
      async readRange() {
        throw boom;
      },
    };
    await expect(extractIsoBmffDurationSeconds(throwingSource)).rejects.toBe(boom);
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
