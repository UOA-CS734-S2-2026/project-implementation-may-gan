import type { AllowedContentType } from "../features/media/policy";

export type MagicByteCheckResult = "match" | "mismatch";

const HEIC_BRANDS = new Set(["heic", "heix", "heim", "heis", "hevc", "hevx", "mif1", "msf1"]);
const QUICKTIME_BRAND = "qt  ";
const WEBP_CHUNK_IDS = new Set(["VP8 ", "VP8L", "VP8X"]);
/** Pre-ftyp legacy QuickTime files identify only by their first top-level box type. */
const LEGACY_QUICKTIME_TOP_LEVEL_BOXES = new Set(["moov", "free", "wide", "skip", "pnot", "mdat", "junk"]);

function readAscii(bytes: Uint8Array, offset: number, length: number): string | undefined {
  if (offset < 0 || offset + length > bytes.byteLength) return undefined;
  let text = "";
  for (let index = offset; index < offset + length; index += 1) text += String.fromCharCode(bytes[index]!);
  return text;
}

function readUint32BE(bytes: Uint8Array, offset: number): number | undefined {
  if (offset < 0 || offset + 4 > bytes.byteLength) return undefined;
  return (
    ((bytes[offset]! << 24) | (bytes[offset + 1]! << 16) | (bytes[offset + 2]! << 8) | bytes[offset + 3]!) >>> 0
  );
}

/** RIFF/WEBP fields are little-endian, unlike ISO-BMFF's big-endian box sizes. */
function readUint32LE(bytes: Uint8Array, offset: number): number | undefined {
  if (offset < 0 || offset + 4 > bytes.byteLength) return undefined;
  return (bytes[offset]! | (bytes[offset + 1]! << 8) | (bytes[offset + 2]! << 16) | (bytes[offset + 3]! << 24)) >>> 0;
}

function matchesBytes(bytes: Uint8Array, offset: number, expected: number[]): boolean {
  if (offset + expected.length > bytes.byteLength) return false;
  return expected.every((value, index) => bytes[offset + index] === value);
}

interface FtypBrands {
  majorBrand: string;
  compatibleBrands: string[];
}

/** Parses an ISO-BMFF `ftyp` box starting at offset 0 of `window`. */
function parseFtypBrands(window: Uint8Array, declaredBoxSize: number): FtypBrands | undefined {
  const boxSize = Math.min(declaredBoxSize, window.byteLength);
  if (boxSize < 16 || readAscii(window, 4, 4) !== "ftyp") return undefined;

  const majorBrand = readAscii(window, 8, 4);
  if (!majorBrand) return undefined;

  const compatibleBrands: string[] = [];
  for (let offset = 16; offset + 4 <= boxSize; offset += 4) {
    const brand = readAscii(window, offset, 4);
    if (brand) compatibleBrands.push(brand);
  }
  return { majorBrand, compatibleBrands };
}

/**
 * A targeted claim-check — does this file's leading bytes match what we'd expect
 * *given its declared type*, not general-purpose format sniffing. Appropriate here
 * because the allowed content types are a fixed, small set (see policy.ts).
 */
export function checkMagicBytes(declaredContentType: AllowedContentType, window: Uint8Array): MagicByteCheckResult {
  switch (declaredContentType) {
    case "image/jpeg":
      return matchesBytes(window, 0, [0xff, 0xd8, 0xff]) ? "match" : "mismatch";

    case "image/png":
      return matchesBytes(window, 0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]) ? "match" : "mismatch";

    case "image/webp":
      return readAscii(window, 0, 4) === "RIFF" && readAscii(window, 8, 4) === "WEBP" ? "match" : "mismatch";

    case "image/heic": {
      const boxSize = readUint32BE(window, 0);
      if (boxSize === undefined) return "mismatch";
      const ftyp = parseFtypBrands(window, boxSize);
      if (!ftyp) return "mismatch";
      const brands = [ftyp.majorBrand, ...ftyp.compatibleBrands];
      return brands.some((brand) => HEIC_BRANDS.has(brand)) ? "match" : "mismatch";
    }

    case "video/mp4": {
      const boxSize = readUint32BE(window, 0);
      if (boxSize === undefined) return "mismatch";
      const ftyp = parseFtypBrands(window, boxSize);
      if (!ftyp) return "mismatch";
      const brands = [ftyp.majorBrand, ...ftyp.compatibleBrands];
      // MP4's brand space is vendor-extensible (isom/iso2/mp41/mp42/avc1/M4V…), so a
      // positive allowlist would false-negative on legitimate encoders. Given the
      // declared type is already narrowed to one of 6 values, excluding the two
      // other ftyp-based things this file could be (QuickTime, HEIC) is the correct
      // bounded check.
      const isQuickTime = brands.includes(QUICKTIME_BRAND);
      const isHeic = brands.some((brand) => HEIC_BRANDS.has(brand));
      return !isQuickTime && !isHeic ? "match" : "mismatch";
    }

    case "video/quicktime": {
      const boxSize = readUint32BE(window, 0);
      if (boxSize !== undefined) {
        const ftyp = parseFtypBrands(window, boxSize);
        if (ftyp) {
          const brands = [ftyp.majorBrand, ...ftyp.compatibleBrands];
          return brands.includes(QUICKTIME_BRAND) ? "match" : "mismatch";
        }
      }
      // No ftyp box at all: legacy pre-ftyp QuickTime identifies by its first
      // top-level box type instead. MP4/HEIC always require ftyp, so this fallback
      // never misclassifies those.
      const firstBoxType = readAscii(window, 4, 4);
      return firstBoxType && LEGACY_QUICKTIME_TOP_LEVEL_BOXES.has(firstBoxType) ? "match" : "mismatch";
    }

    default:
      return "mismatch";
  }
}

export type RangeReader = (start: number, end: number) => Promise<Uint8Array | undefined>;

/** Matches every case in the table above without needing to re-fetch for a larger `ftyp`. */
export const INITIAL_MAGIC_BYTE_PROBE_BYTES = 64;
/** Beyond this, an `ftyp` box is treated as suspicious rather than legitimately large. */
export const MAX_FTYP_BYTES = 512;

/**
 * Reads the leading-bytes window `checkMagicBytes` needs — usually one small
 * bounded read, with at most one follow-up read if a real `ftyp` box turns out to
 * be larger than the initial probe (still capped, never unbounded).
 */
export async function readMagicByteWindow(
  read: RangeReader,
  fileSize: number,
  initialProbeBytes = INITIAL_MAGIC_BYTE_PROBE_BYTES,
  maxFtypBytes = MAX_FTYP_BYTES,
): Promise<Uint8Array | undefined> {
  const initialEnd = Math.min(initialProbeBytes, fileSize) - 1;
  if (initialEnd < 0) return undefined;
  const initial = await read(0, initialEnd);
  if (!initial) return undefined;

  if (readAscii(initial, 4, 4) !== "ftyp") return initial;
  const declaredSize = readUint32BE(initial, 0);
  if (declaredSize === undefined || declaredSize <= initial.byteLength) return initial;
  if (declaredSize > maxFtypBytes) return undefined; // suspiciously large ftyp box — fail closed

  const followUpEnd = Math.min(declaredSize, fileSize) - 1;
  const followUp = await read(initial.byteLength, followUpEnd);
  if (!followUp) return undefined;

  const combined = new Uint8Array(initial.byteLength + followUp.byteLength);
  combined.set(initial, 0);
  combined.set(followUp, initial.byteLength);
  return combined;
}

export interface BoxSource {
  fileSize: number;
  /** Returns undefined on any read failure or inconsistency — callers must fail closed. */
  readRange(start: number, end: number): Promise<Uint8Array | undefined>;
}

export interface DurationBudget {
  maxBoxesWalked: number;
  maxTotalBytesRead: number;
}

export type ExtractDurationResult = { outcome: "duration"; seconds: number } | { outcome: "malformed" };

/**
 * Real phone-captured files need ~4-9 header reads (ftyp, maybe free/wide, moov,
 * mvhd as moov's first/second child) — 64 gives 7-10x headroom while still
 * bounding a pathological fake-box-tree file to a small, fixed number of tiny
 * reads. 256 KiB is a pure circuit-breaker (realistic worst case is ~1 KB) so a
 * future bug that reads box *bodies* instead of headers aborts loudly instead of
 * quietly ballooning R2 egress or Worker CPU.
 */
export const DEFAULT_DURATION_BUDGET: DurationBudget = { maxBoxesWalked: 64, maxTotalBytesRead: 256 * 1024 };

class BudgetExceededError extends Error {}

class BudgetTracker {
  private boxesWalked = 0;
  private bytesRead = 0;

  constructor(private readonly budget: DurationBudget) {}

  async read(source: BoxSource, start: number, end: number): Promise<Uint8Array | undefined> {
    this.boxesWalked += 1;
    if (this.boxesWalked > this.budget.maxBoxesWalked) throw new BudgetExceededError();
    this.bytesRead += end - start + 1;
    if (this.bytesRead > this.budget.maxTotalBytesRead) throw new BudgetExceededError();
    return source.readRange(start, end);
  }
}

interface BoxHeader {
  type: string;
  bodyStart: number;
  boxEnd: number;
}

/** Reads one box header (8 or 16 bytes) at `offset`, bounded to end within `containerEnd`. */
async function readBoxHeader(
  source: BoxSource,
  offset: number,
  containerEnd: number,
  tracker: BudgetTracker,
): Promise<BoxHeader | undefined> {
  if (offset + 8 > containerEnd) return undefined;
  const header = await tracker.read(source, offset, offset + 7);
  if (!header || header.byteLength < 8) return undefined;

  let size = readUint32BE(header, 0)!;
  let bodyStart = offset + 8;
  if (size === 1) {
    // 64-bit extended size immediately follows the ordinary 8-byte header.
    if (offset + 16 > containerEnd) return undefined;
    const extended = await tracker.read(source, offset + 8, offset + 15);
    if (!extended || extended.byteLength < 8) return undefined;
    const high = readUint32BE(extended, 0);
    const low = readUint32BE(extended, 4);
    if (high === undefined || low === undefined) return undefined;
    const big = BigInt(high) * 2n ** 32n + BigInt(low);
    if (big > BigInt(Number.MAX_SAFE_INTEGER)) return undefined; // absurd size — fail closed
    size = Number(big);
    bodyStart = offset + 16;
  }
  // size === 0 ("extends to end of file") is a legal but rare legacy form we don't
  // support — every box we actually need to walk through here (top-level boxes
  // before moov, moov's children before mvhd) must have a concrete end so the walk
  // can continue past it; failing closed here is strictly safer than guessing.
  if (size < 8) return undefined;

  const type = readAscii(header, 4, 4);
  if (!type) return undefined;
  const boxEnd = offset + size;
  if (boxEnd > containerEnd) return undefined; // declared size is inconsistent with the real container
  return { type, bodyStart, boxEnd };
}

async function findBoxInRange(
  source: BoxSource,
  rangeStart: number,
  rangeEnd: number,
  targetType: string,
  tracker: BudgetTracker,
): Promise<BoxHeader | undefined> {
  let offset = rangeStart;
  while (offset < rangeEnd) {
    const header = await readBoxHeader(source, offset, rangeEnd, tracker);
    if (!header) return undefined;
    if (header.type === targetType) return header;
    offset = header.boxEnd;
  }
  return undefined;
}

async function readTrailingBytes(source: BoxSource, length: number): Promise<Uint8Array | undefined> {
  if (source.fileSize < length) return undefined;
  return source.readRange(source.fileSize - length, source.fileSize - 1);
}

/**
 * Beyond checkMagicBytes' leading-signature check: confirms each format's other
 * load-bearing structural markers are actually present, so a payload that merely
 * *starts* with the declared type's magic bytes — and nothing else real — can't
 * pass. Still bounded: at most one small extra read (the file's last few bytes)
 * for jpeg/png, none for webp (already inside the leading window read earlier),
 * and one box-header-only walk, budgeted the same as the duration walker, for
 * heic. video/mp4 and video/quicktime are checked in extractIsoBmffDurationSeconds
 * instead (it already walks the same box tree for the duration; a `trak`/`mdat`
 * requirement there covers this without walking twice).
 */
export async function checkEssentialStructure(
  declaredContentType: AllowedContentType,
  window: Uint8Array,
  source: BoxSource,
): Promise<MagicByteCheckResult> {
  switch (declaredContentType) {
    case "image/jpeg": {
      const tail = await readTrailingBytes(source, 2);
      return tail && matchesBytes(tail, 0, [0xff, 0xd9]) ? "match" : "mismatch";
    }

    case "image/png": {
      // A PNG's first chunk is always IHDR and its last is always IEND.
      if (readAscii(window, 12, 4) !== "IHDR") return "mismatch";
      const tail = await readTrailingBytes(source, 8);
      return tail && readAscii(tail, 0, 4) === "IEND" ? "match" : "mismatch";
    }

    case "image/webp": {
      const chunkId = readAscii(window, 12, 4);
      if (!chunkId || !WEBP_CHUNK_IDS.has(chunkId)) return "mismatch";

      // RIFF's own declared container size must actually match the real file
      // size — a fabricated chunk id with no real payload behind it won't have
      // this line up, since nothing computed it from real content.
      const riffSize = readUint32LE(window, 4);
      if (riffSize === undefined || riffSize !== source.fileSize - 8) return "mismatch";

      if (chunkId === "VP8X") {
        // VP8X's body is a fixed-size 10-byte feature/canvas-size header, no
        // bitstream of its own to check — but its declared size must match that.
        return readUint32LE(window, 16) === 10 ? "match" : "mismatch";
      }

      const chunkSize = readUint32LE(window, 16);
      if (chunkSize === undefined || chunkSize === 0 || 20 + chunkSize > source.fileSize) return "mismatch";

      if (chunkId === "VP8L") {
        // A real VP8L bitstream always starts with this signature byte.
        return window.length > 20 && window[20] === 0x2f ? "match" : "mismatch";
      }

      // VP8 (lossy): a 3-byte frame tag precedes this well-known key-frame start
      // code (RFC 6386 §9.1) — every single-image WebP frame is a key frame.
      return matchesBytes(window, 23, [0x9d, 0x01, 0x2a]) ? "match" : "mismatch";
    }

    case "image/heic": {
      try {
        const tracker = new BudgetTracker(DEFAULT_DURATION_BUDGET);
        const meta = await findBoxInRange(source, 0, source.fileSize, "meta", tracker);
        return meta ? "match" : "mismatch";
      } catch (error) {
        if (error instanceof BudgetExceededError) return "mismatch";
        throw error;
      }
    }

    case "video/mp4":
    case "video/quicktime":
      return "match";

    default:
      return "mismatch";
  }
}

/**
 * Reads the duration/timescale fields shared by `mvhd` (movie header) and `mdhd`
 * (a track's own media header) — byte-identical version 0/1 layouts — handling
 * both the v0 (32-bit) and v1 (64-bit) forms.
 */
async function parseDurationBoxSeconds(
  source: BoxSource,
  box: BoxHeader,
  tracker: BudgetTracker,
): Promise<number | undefined> {
  const probeEnd = Math.min(box.bodyStart + 39, box.boxEnd - 1);
  if (probeEnd < box.bodyStart) return undefined;
  const body = await tracker.read(source, box.bodyStart, probeEnd);
  if (!body || body.byteLength < 1) return undefined;

  const version = body[0];
  let timescale: number | undefined;
  let duration: number | undefined;
  if (version === 0) {
    timescale = readUint32BE(body, 12);
    duration = readUint32BE(body, 16);
  } else if (version === 1) {
    timescale = readUint32BE(body, 20);
    const high = readUint32BE(body, 24);
    const low = readUint32BE(body, 28);
    // Real video durations never approach 2^53 ms-ticks; plain number math is safe.
    if (high !== undefined && low !== undefined) duration = high * 2 ** 32 + low;
  } else {
    return undefined;
  }

  if (!timescale || timescale <= 0 || duration === undefined || duration < 0) return undefined;
  return duration / timescale;
}

/**
 * Bounded ISO-BMFF (MP4/QuickTime share this container format) duration reader.
 * Walks box *headers* only, jumping by each box's own declared size — never reads
 * a skipped box's body, so a well-formed file costs only a handful of tiny ranged
 * reads regardless of where `moov` sits (some encoders write `mdat` first). Fails
 * closed — never treats "couldn't determine duration" as a pass.
 */
export async function extractIsoBmffDurationSeconds(
  source: BoxSource,
  budget: DurationBudget = DEFAULT_DURATION_BUDGET,
): Promise<ExtractDurationResult> {
  try {
    const tracker = new BudgetTracker(budget);
    const moov = await findBoxInRange(source, 0, source.fileSize, "moov", tracker);
    if (!moov) return { outcome: "malformed" };

    const mvhd = await findBoxInRange(source, moov.bodyStart, moov.boxEnd, "mvhd", tracker);
    if (!mvhd) return { outcome: "malformed" };

    // A real capture always has at least one track — this alone is what keeps a
    // fabricated ftyp+moov+mvhd (no actual video content at all) from validating.
    const trak = await findBoxInRange(source, moov.bodyStart, moov.boxEnd, "trak", tracker);
    if (!trak) return { outcome: "malformed" };

    // ...and its media payload actually exists somewhere: a non-empty top-level
    // `mdat`. Box-header-only, so this costs nothing beyond the handful of tiny
    // reads already budgeted for this walk.
    const mdat = await findBoxInRange(source, 0, source.fileSize, "mdat", tracker);
    if (!mdat || mdat.boxEnd <= mdat.bodyStart) return { outcome: "malformed" };

    // mvhd's duration alone is just a declared header field with no structural
    // tie to the track's actual media — a fabricated `trak` with junk bytes could
    // carry any mvhd duration. mdia/mdhd is the track's OWN media header (same
    // v0/v1 layout as mvhd, in the track's own timescale); requiring it present,
    // and cross-checking it against mvhd, means both would have to be faked
    // together, and rules out a `trak` that's just an empty placeholder box.
    const mdia = await findBoxInRange(source, trak.bodyStart, trak.boxEnd, "mdia", tracker);
    if (!mdia) return { outcome: "malformed" };
    const mdhd = await findBoxInRange(source, mdia.bodyStart, mdia.boxEnd, "mdhd", tracker);
    if (!mdhd) return { outcome: "malformed" };

    const movieSeconds = await parseDurationBoxSeconds(source, mvhd, tracker);
    const trackSeconds = await parseDurationBoxSeconds(source, mdhd, tracker);
    if (movieSeconds === undefined || !Number.isFinite(movieSeconds)) return { outcome: "malformed" };
    if (trackSeconds === undefined || !Number.isFinite(trackSeconds)) return { outcome: "malformed" };

    const larger = Math.max(movieSeconds, trackSeconds);
    const smaller = Math.min(movieSeconds, trackSeconds);
    const tolerance = Math.max(1, larger * 0.05); // rounding across different timescales, not a hard equality
    if (larger - smaller > tolerance) return { outcome: "malformed" };

    // The larger of the two: never let one falsified field alone understate the
    // real duration relative to MAX_VIDEO_DURATION_SECONDS.
    return { outcome: "duration", seconds: larger };
  } catch (error) {
    if (error instanceof BudgetExceededError) return { outcome: "malformed" };
    throw error;
  }
}
