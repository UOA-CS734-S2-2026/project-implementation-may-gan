import { describe, expect, it } from "vitest";
import {
  buildBoxWithDeclaredSize,
  buildEsdsBox,
  buildFtypBox,
  buildHdlrBox,
  buildMinimalM4a,
  buildMinimalMp4,
  buildMoovBox,
  buildMvhdBoxV0,
  buildMvhdBoxV1,
  buildTrakBox,
  concatBoxes,
  validJpegBytes,
  wrapBox,
  type M4aOptions,
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

/**
 * The header of a real clip recorded on an Android emulator's camera and compressed by
 * the app: ftyp and moov, then a `free` box and a 64-bit `mdat`. Its audio track runs
 * 5.76 s, its video track 4.20 s, and the movie header 5.56 s, so the video track is
 * 1.36 s shorter than the header. Only box headers are read, so the media itself is
 * stood in for by a file size and the two box headers that follow the moov.
 */
const androidCameraClip = {
  fileSize: 702_753,
  leading: Uint8Array.from(
    atob(
  "AAAAHGZ0eXBpc29tAAIAAGlzb21pc28ybXA0MQAAC6ltb292AAAAbG12aGQAAAAA5uaMwObmjMAAACcQAADZMAABAAABAAAA" +
  "AAAAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD" +
  "AAAAdm1ldGEAAAAhaGRscgAAAAAAAAAAbWR0YQAAAAAAAAAAAAAAAAAAAAAra2V5cwAAAAAAAAABAAAAG21kdGFjb20uYW5k" +
  "cm9pZC52ZXJzaW9uAAAAImlsc3QAAAAaAAAAAQAAABJkYXRhAAAAAQAAAAAxNwAAA/d0cmFrAAAAXHRraGQAAAAH5uaMwObm" +
  "jMAAAAABAAAAAAAA2TAAAAAAAAAAAAAAAAABAAAAAAAAAP//AAAAAAAAAAEAAAAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAA" +
  "AAAAAAAsZWR0cwAAACRlbHN0AQAAAAAAAAEAAAAAAADZMAAAAAAAAAZAAAEAAAAAA2dtZGlhAAAAIG1kaGQAAAAA5uaMwObm" +
  "jMAAAB9AAAC0AAAAAAAAAAAsaGRscgAAAAAAAAAAc291bgAAAAAAAAAAAAAAAFNvdW5kSGFuZGxlAAAAAxNtaW5mAAAAEHNt" +
  "aGQAAAAAAAAAAAAAACRkaW5mAAAAHGRyZWYAAAAAAAAAAQAAAAx1cmwgAAAAAQAAAtdzdGJsAAAAW3N0c2QAAAAAAAAAAQAA" +
  "AEttcDRhAAAAAAAAAAEAAAAAAAAAAAABABAAAAAAH0AAAAAAACdlc2RzAAAAAAMZAAAABBFAFQADAAACAAAAAgAABQIViAYB" +
  "AgAAABhzdHRzAAAAAAAAAAEAAAAtAAAEAAAAAMhzdHN6AAAAAAAAAAAAAAAtAAADAAAAAwAAAAMAAAADAAAAAwAAAAMAAAAD" +
  "AAAAAwAAAAMAAAADAAAAAwAAAAMAAAADAAAAAwAAAAMAAAADAAAAAwAAAAMAAAADAAAAAwAAAAMAAAADAAAAAwAAAAMAAAAD" +
  "AAAAAwAAAAMAAAADAAAAAwAAAAMAAAADAAAAAwAAAAMAAAADAAAAAwAAAAMAAAADAAAAAwAAAAMAAAADAAAAAwAAAAMAAAAD" +
  "AAAAAwAAAAMAAAAAHHN0c2MAAAAAAAAAAQAAAAEAAAABAAAAAQAAAXhjbzY0AAAAAAAAAC0AAAAAAAYatAAAAAAABh20AAAA" +
  "AAAGILQAAAAAAAYjtAAAAAAABk6ZAAAAAAAGY+4AAAAAAAaX7AAAAAAAB0MJAAAAAAAHv+kAAAAAAAg7bQAAAAAACFIhAAAA" +
  "AAAIk6QAAAAAAAichAAAAAAACKaDAAAAAAAIqYMAAAAAAAjNagAAAAAACNBqAAAAAAAI5TgAAAAAAAjrpAAAAAAACP5dAAAA" +
  "AAAJOcgAAAAAAAlH1wAAAAAACU8qAAAAAAAJYzgAAAAAAAl9NQAAAAAACYf4AAAAAAAJoUgAAAAAAAnfOwAAAAAACe7uAAAA" +
  "AAAKAOsAAAAAAAoKwQAAAAAAChtPAAAAAAAKKyoAAAAAAApHKAAAAAAACoLFAAAAAAAKidcAAAAAAAqeIQAAAAAACqEhAAAA" +
  "AAAKpCEAAAAAAAqnIQAAAAAACqohAAAAAAAKrSEAAAAAAAqwIQAAAAAACrMhAAAAAAAKtiEAAAbIdHJhawAAAFx0a2hkAAAA" +
  "B+bmjMDm5ozAAAAAAgAAAAAAAKQ2AAAAAAAAAAAAAAAAAAAAAAAAAAD//wAAAAAAAAABAAAAAAAAAAAAAAAAAAAAAAAAQAAA" +
  "AAUAAAAC0AAAAAAGZG1kaWEAAAAgbWRoZAAAAADm5ozA5uaMwAABX5AABcXnAAAAAAAAACxoZGxyAAAAAAAAAAB2aWRlAAAA" +
  "AAAAAAAAAAAAVmlkZW9IYW5kbGUAAAAGEG1pbmYAAAAUdm1oZAAAAAAAAAAAAAAAAAAAACRkaW5mAAAAHGRyZWYAAAAAAAAA" +
  "AQAAAAx1cmwgAAAAAQAABdBzdGJsAAAAtHN0c2QAAAAAAAAAAQAAAKRhdmMxAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAAABQAC" +
  "0ABIAAAASAAAAAAAAAABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAGP//AAAAK2F2Y0MBQsAp/+EAEmdCwCmN" +
  "aAUAW6QgICAg8IhGoAEABmjOAag1yAAAABBwYXNwAAEAAAABAAAAAAATY29scm5jbHgAAQABAAEAAAAB4HN0dHMAAAAAAAAA" +
  "OgAAAAEAACQpAAAAAQAAGbgAAAABAAAXgAAAAAEAAA9RAAAAAQAADygAAAABAAAL4QAAAAEAACPKAAAAAQAAEv8AAAABAAAP" +
  "bQAAAAEAAA7nAAAAAQAAHqQAAAABAAAcSgAAAAEAAA6mAAAAAQAADQ0AAAABAAATcQAAAAEAAAwqAAAAAQAAFB4AAAABAAAa" +
  "ggAAAAEAAE37AAAAAQAADNAAAAABAAAYSgAAAAEAAA2JAAAAAQAAM8wAAAABAAA+MAAAAAEAABoYAAAAAQAAFasAAAABAAAf" +
  "MwAAAAEAAA2fAAAAAQAAGZ4AAAABAABBWwAAAAEAAAzhAAAAAQAAEFYAAAABAAAMWQAAAAEAAAzhAAAAAQAAC98AAAABAAAh" +
  "jwAAAAEAABypAAAAAQAAHqIAAAABAAAL8wAAAAEAABHfAAAAAQAAHYkAAAABAAAMBgAAAAEAAChnAAAAAQAANRQAAAABAAAR" +
  "UAAAAAIAAAvYAAAAAQAAGZEAAAABAAANSQAAAAEAAB0yAAAAAQAAC80AAAABAAAdHgAAAAEAABB/AAAAAQAAC+cAAAABAAAT" +
  "7wAAAAEAAA+bAAAAAQAAFq8AAAABAAA3+wAAAAIAABy6AAABBHN0c3oAAAAAAAAAAAAAADwAABSWAAATTwAAElUAABgJAAAY" +
  "9QAAKDUAADnLAABGHQAAO7cAAD4pAAA8rQAAO9cAABIXAAABnQAAMnkAAARmAAAAuAAABuwAAAXgAAAG/wAABFwAAAMlAAAI" +
  "swAAELMAABHOAAADbAAACWMAAAZWAAAyrwAABbwAAAsPAAAEUwAAApEAAAWsAAAFsgAAAx8AAAn7AAANAgAAB8MAAAxcAAAD" +
  "eAAABnwAADMcAAAH1wAADLMAAA5CAAAAuwAAA8kAAAMNAAAFmAAAB/YAAANaAAAJgQAAB34AAAh4AAAJCAAAM3AAAAUtAAAE" +
  "EgAAEUoAAAAcc3RzYwAAAAAAAAABAAAAAQAAAAEAAAABAAAB8GNvNjQAAAAAAAAAPAAAAAAABia0AAAAAAAGO0oAAAAAAAZR" +
  "mQAAAAAABmbuAAAAAAAGfvcAAAAAAAaa7AAAAAAABsMhAAAAAAAG/OwAAAAAAAdGCQAAAAAAB4HAAAAAAAAHwukAAAAAAAf/" +
  "lgAAAAAACD5tAAAAAAAIUIQAAAAAAAhVIQAAAAAACIeaAAAAAAAIjAAAAAAAAAiMuAAAAAAACJakAAAAAAAIn4QAAAAAAAis" +
  "gwAAAAAACLDfAAAAAAAItAQAAAAAAAi8twAAAAAACNNqAAAAAAAI6DgAAAAAAAjupAAAAAAACPgHAAAAAAAJAV0AAAAAAAk0" +
  "DAAAAAAACTzIAAAAAAAJStcAAAAAAAlSKgAAAAAACVS7AAAAAAAJWmcAAAAAAAlgGQAAAAAACWY4AAAAAAAJcDMAAAAAAAmA" +
  "NQAAAAAACYr4AAAAAAAJl1QAAAAAAAmazAAAAAAACaRIAAAAAAAJ12QAAAAAAAniOwAAAAAACfHuAAAAAAAKADAAAAAAAAoD" +
  "6wAAAAAACge0AAAAAAAKDcEAAAAAAAoTWQAAAAAACh5PAAAAAAAKIakAAAAAAAouKgAAAAAACjWoAAAAAAAKPiAAAAAAAApK" +
  "KAAAAAAACn2YAAAAAAAKhcUAAAAAAAqM1wAAACRzdHNzAAAAAAAAAAUAAAABAAAADwAAAB0AAAArAAAAOQ=="
    ),
    (char) => char.charCodeAt(0),
  ),
  // Box headers at 3,013 (free, 397,023 bytes) and 400,036 (mdat, 64-bit size).
  headers: new Map([
    [3_013, "00060edf66726565"],
    [400_036, "000000016d6461740000000000049e7d"],
  ]),
};

function androidCameraClipSource(): BoxSource {
  const { fileSize, leading, headers } = androidCameraClip;
  const segments: Array<[number, Uint8Array]> = [
    [0, leading],
    ...[...headers].map(([start, hex]): [number, Uint8Array] => [
      start,
      Uint8Array.from(hex.match(/../g)!, (pair) => Number.parseInt(pair, 16)),
    ]),
  ];
  return {
    fileSize,
    // Serves a range lying wholly inside one known segment, and nothing else.
    async readRange(start, end) {
      const segment = segments.find(([from, bytes]) => start >= from && end < from + bytes.byteLength);
      return segment ? segment[1].slice(start - segment[0], end - segment[0] + 1) : undefined;
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

  it("matches audio MP4 by excluding QuickTime and HEIC brands, like MP4", () => {
    expect(checkMagicBytes("audio/mp4", buildFtypBox("M4A ", ["M4A ", "mp42", "isom"]))).toBe("match");
    expect(checkMagicBytes("audio/mp4", buildFtypBox("qt  "))).toBe("mismatch");
    expect(checkMagicBytes("audio/mp4", buildFtypBox("heic", ["mif1"]))).toBe("mismatch");
    expect(checkMagicBytes("audio/mp4", validJpegBytes)).toBe("mismatch");
    expect(checkMagicBytes("audio/mp4", new Uint8Array([0x49, 0x44, 0x33, 0x04]))).toBe("mismatch"); // an MP3's ID3 tag
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

  it("defers video/mp4, video/quicktime and audio/mp4 to extractIsoBmffDurationSeconds's own trak/mdat check", async () => {
    const anything = new Uint8Array([1, 2, 3]);
    expect(await checkEssentialStructure("audio/mp4", anything, boxSourceFor(anything))).toBe("match");
    expect(await checkEssentialStructure("video/mp4", anything, boxSourceFor(anything))).toBe("match");
    expect(await checkEssentialStructure("video/quicktime", anything, boxSourceFor(anything))).toBe("match");
  });
});

describe("extractIsoBmffDurationSeconds for voice memos", () => {
  it("reads the duration from the soun track", async () => {
    const file = buildMinimalM4a(42);
    expect(await extractIsoBmffDurationSeconds(boxSourceFor(file), undefined, "soun")).toEqual({
      outcome: "duration",
      seconds: 42,
    });
  });

  it("is malformed for a video, which has no soun track", async () => {
    const file = buildMinimalMp4(5);
    expect(await extractIsoBmffDurationSeconds(boxSourceFor(file), undefined, "soun")).toEqual({ outcome: "malformed" });
  });

  it("is malformed for an audio file when asked for a video, and for any file that also holds video", async () => {
    const audio = buildMinimalM4a(5);
    expect(await extractIsoBmffDurationSeconds(boxSourceFor(audio))).toEqual({ outcome: "malformed" });

    const video = buildTrakBox({ timescale: 1000, duration: 5000, handlerType: "vide" });
    const both = buildMinimalM4a(5, 44_100, { extraTracks: [video] });
    expect(await extractIsoBmffDurationSeconds(boxSourceFor(both), undefined, "soun")).toEqual({ outcome: "malformed" });
  });

  it("is malformed with no mdat payload", async () => {
    const file = concatBoxes(
      buildFtypBox("M4A ", ["M4A "]),
      buildMoovBox([
        buildMvhdBoxV0({ timescale: 1000, duration: 5000 }),
        buildTrakBox({ timescale: 44_100, duration: 5 * 44_100, handlerType: "soun" }),
      ]),
    );
    expect(await extractIsoBmffDurationSeconds(boxSourceFor(file), undefined, "soun")).toEqual({ outcome: "malformed" });
  });
});

describe("AAC verification for voice memos", () => {
  const audioDuration = (file: Uint8Array) => extractIsoBmffDurationSeconds(boxSourceFor(file), undefined, "soun");
  const malformed = { outcome: "malformed" };

  it("accepts several chunks, per-sample sizes and 64-bit chunk offsets", async () => {
    // 5 s at 44.1 kHz is 216 frames.
    const sizes = Array.from({ length: 216 }, (_, index) => 20 + (index % 7));
    expect(await audioDuration(buildMinimalM4a(5, 44_100, { sampleSize: sizes, chunks: [100, 100, 16] })))
      .toEqual({ outcome: "duration", seconds: 5 });
    expect(await audioDuration(buildMinimalM4a(5, 44_100, { wideOffsets: true, chunks: [108, 108] })))
      .toEqual({ outcome: "duration", seconds: 5 });
  });

  it("fits a full-length recording with a per-sample size table inside the read budget", async () => {
    // 60 s at 48 kHz is 2,813 frames; each size is read from the table.
    const sizes = Array.from({ length: 2813 }, (_, index) => 90 + (index % 40));
    const result = await audioDuration(buildMinimalM4a(60, 48_000, { sampleSize: sizes, chunks: Array.from({ length: 60 }, (_, index) => (index < 59 ? 47 : 2813 - 59 * 47)) }));
    expect(result).toEqual({ outcome: "duration", seconds: 60 });
  });

  it("accepts HE-AAC signalling and other common sample rates and layouts", async () => {
    for (const esds of [
      buildEsdsBox({ audioObjectType: 5 }),
      buildEsdsBox({ audioObjectType: 29, channelConfiguration: 1 }),
      buildEsdsBox({ samplingFrequencyIndex: 3, channelConfiguration: 6 }),
    ]) {
      expect(await audioDuration(buildMinimalM4a(5, 48_000, { esds }))).toMatchObject({ outcome: "duration" });
    }
  });

  it("rejects headers over arbitrary mdat bytes, the shape the checks used to accept", async () => {
    const file = concatBoxes(
      buildFtypBox("M4A ", ["M4A ", "isom"]),
      buildMoovBox([
        buildMvhdBoxV0({ timescale: 1000, duration: 5000 }),
        buildTrakBox({ timescale: 44_100, duration: 5 * 44_100, handlerType: "soun" }),
      ]),
      wrapBox("mdat", new Uint8Array([0, 1, 2, 3])),
    );
    expect(await audioDuration(file)).toEqual(malformed);
  });

  it.each(["stsd", "stts", "stsc", "stsz", "stco"] as const)("rejects a track with no %s", async (table) => {
    expect(await audioDuration(buildMinimalM4a(5, 44_100, { omit: [table] }))).toEqual(malformed);
  });

  it.each<[string, M4aOptions]>([
    ["a different codec (alac)", { sampleEntryType: "alac" }],
    ["MP3 in an MP4 (.mp3)", { sampleEntryType: ".mp3" }],
    ["Opus in an MP4", { sampleEntryType: "Opus" }],
    ["a sample entry with no esds", { esds: null }],
    ["a non-AAC object type (MP3)", { esds: buildEsdsBox({ objectTypeIndication: 0x6b }) }],
    ["a video stream type", { esds: buildEsdsBox({ streamType: 0x11 }) }],
    ["no audio object type", { esds: buildEsdsBox({ audioObjectType: 0 }) }],
    ["a non-AAC audio object type", { esds: buildEsdsBox({ audioObjectType: 17 }) }],
    ["a reserved sampling-frequency index", { esds: buildEsdsBox({ samplingFrequencyIndex: 13 }) }],
    ["a channel layout from a program config", { esds: buildEsdsBox({ channelConfiguration: 0 }) }],
    ["no channels", { channelCount: 0 }],
    ["too many channels", { channelCount: 9 }],
    ["an 8-bit sample size", { sampleBits: 8 }],
  ])("rejects %s", async (_label, options) => {
    expect(await audioDuration(buildMinimalM4a(5, 44_100, options))).toEqual(malformed);
  });

  describe("a malformed mp4a sample entry", () => {
    const boxHeader = (type: string, size: number) => buildBoxWithDeclaredSize(type, size);

    it("accepts well-formed sibling boxes after esds", async () => {
      // btrt (bitrate) is the usual extra child; its body is three 32-bit fields.
      const btrt = wrapBox("btrt", new Uint8Array(12));
      expect(await audioDuration(buildMinimalM4a(5, 44_100, { entryChildren: [btrt, wrapBox("free", new Uint8Array(3))] })))
        .toEqual({ outcome: "duration", seconds: 5 });
    });

    it.each<[string, M4aOptions]>([
      ["an entry size that runs past the stsd box", { entrySizeDelta: 100 }],
      ["an entry size one byte past the stsd box", { entrySizeDelta: 1 }],
      ["an entry size shorter than its own esds", { entrySizeDelta: -10 }],
      ["an entry size that cuts off the fixed fields", { entrySizeDelta: -60 }],
      ["a later child that overruns the entry", { entryChildren: [boxHeader("btrt", 0x1000)] }],
      ["a later child that is one byte too long", { entryChildren: [buildBoxWithDeclaredSize("btrt", 21, 12)] }],
      ["a later child with a size under 8", { entryChildren: [boxHeader("btrt", 4)] }],
      ["a later child sized 'to the end' (0)", { entryChildren: [boxHeader("btrt", 0)] }],
      ["a later child with a 64-bit size (1)", { entryChildren: [boxHeader("btrt", 1)] }],
      ["stray bytes too short to be a box after esds", { entryTrailingBytes: 4 }],
      ["a second esds", { entryChildren: [buildEsdsBox()] }],
      ["a malformed esds after a good one", { entryChildren: [wrapBox("esds", new Uint8Array(6))] }],
    ])("rejects %s", async (_label, options) => {
      expect(await audioDuration(buildMinimalM4a(5, 44_100, options))).toEqual(malformed);
    });

    it("rejects an entry too large to be read in full", async () => {
      // Well-formed, but bigger than the read window: refused, not partly checked.
      const padding = Array.from({ length: 40 }, () => wrapBox("free", new Uint8Array(24)));
      expect(await audioDuration(buildMinimalM4a(5, 44_100, { entryChildren: padding }))).toEqual(malformed);
    });
  });

  it.each<[string, M4aOptions]>([
    ["zero-length samples", { sampleSize: Array.from({ length: 216 }, () => 0) }],
    ["an implausibly large sample", { sampleSize: Array.from({ length: 216 }, () => 20_000), mdatBytes: 20_000 * 216 }],
    ["fewer chunks than samples need", { chunks: [5] }],
    ["chunk offsets outside the file", { chunkOffsetShift: 1_000_000 }],
    ["chunk offsets before mdat", { chunkOffsetShift: -40 }],
    ["samples that run past the end of mdat", { mdatBytes: 100 }],
    ["a time table with the wrong sample count", { sttsSamples: 215 }],
    ["a size table with the wrong sample count", { stszCount: 217 }],
    ["no samples", { stszCount: 0 }],
    ["an absurd sample count", { stszCount: 100_000 }],
    ["a time table far longer than the headers claim", { sttsTicks: 5 * 44_100 * 3 }],
  ])("rejects %s", async (_label, options) => {
    expect(await audioDuration(buildMinimalM4a(5, 44_100, options))).toEqual(malformed);
  });

  describe("every audio track is held to the limit", () => {
    const longTrack = (extra: Parameters<typeof buildTrakBox>[0]) => buildTrakBox({ ...extra, handlerType: "soun" });

    it("rejects a second audio track that runs far past the movie header", async () => {
      // mvhd and the first track say 30 s; the second says 120 s. It used to be skipped.
      const file = buildMinimalM4a(30, 44_100, {
        extraTracks: [longTrack({ timescale: 44_100, duration: 120 * 44_100 })],
      });
      expect(await audioDuration(file)).toEqual(malformed);
    });

    it("rejects a second audio track with no media header, or that is not AAC", async () => {
      const noHeader = wrapBox("trak", wrapBox("mdia", buildHdlrBox("soun")));
      expect(await audioDuration(buildMinimalM4a(30, 44_100, { extraTracks: [noHeader] }))).toEqual(malformed);

      // Agrees with mvhd, but has no AAC description or samples.
      const bare = longTrack({ timescale: 44_100, duration: 30 * 44_100 });
      expect(await audioDuration(buildMinimalM4a(30, 44_100, { extraTracks: [bare] }))).toEqual(malformed);
    });

    it("accepts several audio tracks that all agree and verify", async () => {
      expect(await audioDuration(buildMinimalM4a(30, 44_100, { audioTrackCount: 2 })))
        .toEqual({ outcome: "duration", seconds: 30 });
    });

    it("still ignores tracks of other kinds, such as metadata", async () => {
      const meta = buildTrakBox({ timescale: 1000, duration: 500_000, handlerType: "meta" });
      expect(await audioDuration(buildMinimalM4a(30, 44_100, { extraTracks: [meta] })))
        .toEqual({ outcome: "duration", seconds: 30 });
    });
  });

  it("reports the longest duration any of the tables claims", async () => {
    // The time table runs 1% past the headers: inside tolerance, but never understated.
    const result = await audioDuration(buildMinimalM4a(60, 44_100, { sttsTicks: Math.round(60.6 * 44_100) }));
    expect(result).toMatchObject({ outcome: "duration" });
    expect((result as { seconds: number }).seconds).toBeCloseTo(60.6, 3);
  });
});

describe("a real camera recording", () => {
  it("accepts a video track that is shorter than the movie header", async () => {
    const result = await extractIsoBmffDurationSeconds(androidCameraClipSource());

    // The movie header covers the longest track (the 5.76 s audio), so it's what's reported.
    expect(result).toMatchObject({ outcome: "duration" });
    expect((result as { seconds: number }).seconds).toBeCloseTo(5.56, 2);
  });

  it("still refuses a video track longer than the movie header", async () => {
    // Same shape, but the header understates the video: a 4.2 s movie with a 9 s video track.
    const video = buildTrakBox({ timescale: 1000, duration: 9_000 });
    const file = buildMinimalMp4(4.2, 1000, [video]);
    expect(await extractIsoBmffDurationSeconds(boxSourceFor(file))).toEqual({ outcome: "malformed" });
  });

  it("applies the limit to the movie header when the video is shorter", async () => {
    // A 4 s video track in a 30 s movie (sound runs on): the longest claim is reported.
    const file = concatBoxes(
      buildFtypBox("isom", ["isom"]),
      buildMoovBox([
        buildMvhdBoxV0({ timescale: 1000, duration: 30_000 }),
        buildTrakBox({ timescale: 1000, duration: 4_000 }),
      ]),
      wrapBox("mdat", new Uint8Array([0, 1, 2, 3])),
    );
    expect(await extractIsoBmffDurationSeconds(boxSourceFor(file))).toEqual({ outcome: "duration", seconds: 30 });
  });
});

describe("extractIsoBmffDurationSeconds video tracks", () => {
  const videoDuration = (file: Uint8Array) => extractIsoBmffDurationSeconds(boxSourceFor(file));

  it("rejects a second video track that runs past the movie header", async () => {
    // mvhd and the first video track say 10 s; the second says 120 s. It used to be skipped.
    const file = buildMinimalMp4(10, 1000, [buildTrakBox({ timescale: 1000, duration: 120_000 })]);
    expect(await videoDuration(file)).toEqual({ outcome: "malformed" });
  });

  it("rejects a second video track with no usable media header", async () => {
    const noHeader = wrapBox("trak", wrapBox("mdia", buildHdlrBox("vide")));
    expect(await videoDuration(buildMinimalMp4(10, 1000, [noHeader]))).toEqual({ outcome: "malformed" });
  });

  it("accepts a second video track that agrees", async () => {
    const file = buildMinimalMp4(10, 1000, [buildTrakBox({ timescale: 1000, duration: 10_000 })]);
    expect(await videoDuration(file)).toEqual({ outcome: "duration", seconds: 10 });
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
