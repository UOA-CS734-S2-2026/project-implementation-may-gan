import type { AllowedContentType } from "../../features/media/shared/media-reservation-policy";

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

function readUint16BE(bytes: Uint8Array, offset: number): number | undefined {
  if (offset < 0 || offset + 2 > bytes.byteLength) return undefined;
  return (bytes[offset]! << 8) | bytes[offset + 1]!;
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
 * because the allowed content types are a fixed, small set (see media-reservation-policy.ts).
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

    case "audio/mp4": {
      const boxSize = readUint32BE(window, 0);
      if (boxSize === undefined) return "mismatch";
      const ftyp = parseFtypBrands(window, boxSize);
      if (!ftyp) return "mismatch";
      const brands = [ftyp.majorBrand, ...ftyp.compatibleBrands];
      // Same bounded negative check as video/mp4: audio MP4 brands (M4A, M4B, mp42,
      // isom…) are vendor-extensible. Whether the file really holds audio and no
      // video is decided by the track walk in extractIsoBmffDurationSeconds.
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
 * Real phone-captured files need ~20-30 small reads (top-level boxes, moov's
 * children, then per track: tkhd/edts/mdia headers, mdhd, hdlr) — 64 gives ~2-3x
 * headroom for a typical audio+video capture while still
 * bounding a pathological fake-box-tree file to a small, fixed number of tiny
 * reads. 256 KiB is a pure circuit-breaker (realistic worst case is ~1 KB) so a
 * future bug that reads box *bodies* instead of headers aborts loudly instead of
 * quietly ballooning R2 egress or Worker CPU.
 */
export const DEFAULT_DURATION_BUDGET: DurationBudget = { maxBoxesWalked: 64, maxTotalBytesRead: 256 * 1024 };

/**
 * An audio recording also walks minf/stbl and reads its sample tables (at most
 * ~100 KB: sample sizes, chunk offsets, sample-to-chunk and time-to-sample), so
 * it gets more box reads than a video's header-only walk. Still a fixed circuit
 * breaker, not a size that grows with the file.
 */
export const AUDIO_DURATION_BUDGET: DurationBudget = { maxBoxesWalked: 160, maxTotalBytesRead: 256 * 1024 };

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

/** Every box of `targetType` directly inside the range; stops at the first unreadable header. */
async function findAllBoxesInRange(
  source: BoxSource,
  rangeStart: number,
  rangeEnd: number,
  targetType: string,
  tracker: BudgetTracker,
): Promise<BoxHeader[]> {
  const found: BoxHeader[] = [];
  let offset = rangeStart;
  while (offset < rangeEnd) {
    const header = await readBoxHeader(source, offset, rangeEnd, tracker);
    if (!header) break;
    if (header.type === targetType) found.push(header);
    offset = header.boxEnd;
  }
  return found;
}

/** The first box of each wanted type directly inside the range, in one pass; stops at the first unreadable header. */
async function collectBoxes(
  source: BoxSource,
  rangeStart: number,
  rangeEnd: number,
  targetTypes: readonly string[],
  tracker: BudgetTracker,
): Promise<Map<string, BoxHeader>> {
  const found = new Map<string, BoxHeader>();
  let offset = rangeStart;
  while (offset < rangeEnd) {
    const header = await readBoxHeader(source, offset, rangeEnd, tracker);
    if (!header) break;
    if (targetTypes.includes(header.type) && !found.has(header.type)) found.set(header.type, header);
    offset = header.boxEnd;
  }
  return found;
}

/** hdlr body: version/flags(4) + pre_defined(4) + handler_type(4) — e.g. "vide", "soun". */
async function readHandlerType(
  source: BoxSource,
  hdlr: BoxHeader,
  tracker: BudgetTracker,
): Promise<string | undefined> {
  if (hdlr.bodyStart + 12 > hdlr.boxEnd) return undefined;
  const body = await tracker.read(source, hdlr.bodyStart, hdlr.bodyStart + 11);
  return body ? readAscii(body, 8, 4) : undefined;
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
    case "audio/mp4":
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
async function parseDurationBoxTimes(
  source: BoxSource,
  box: BoxHeader,
  tracker: BudgetTracker,
): Promise<{ timescale: number; duration: number } | undefined> {
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
  return { timescale, duration };
}

async function parseDurationBoxSeconds(
  source: BoxSource,
  box: BoxHeader,
  tracker: BudgetTracker,
): Promise<number | undefined> {
  const times = await parseDurationBoxTimes(source, box, tracker);
  return times ? times.duration / times.timescale : undefined;
}

/** A raw AAC frame is far smaller than this; a bigger "sample" is not AAC. */
const MAX_AAC_SAMPLE_BYTES = 16 * 1024;
/** A minute of AAC at the highest rate holds ~5,600 frames; this leaves headroom and bounds the reads. */
const MAX_AUDIO_SAMPLES = 8192;
const MAX_AUDIO_CHUNKS = 4096;
const MAX_STTS_ENTRIES = 1024;
const MAX_STSC_ENTRIES = 256;
/**
 * The bytes of `stsd` read to check the sample entry. A real `mp4a` entry is ~100
 * bytes (its fixed fields plus `esds`, sometimes `btrt` or `chan`); one larger than
 * this is refused rather than partly read.
 */
const AUDIO_SAMPLE_DESCRIPTION_PROBE_BYTES = 512;
/** An audio sample entry's size, type and fixed fields, before any child boxes. */
const AUDIO_SAMPLE_ENTRY_FIXED_BYTES = 36;
const MPEG4_AUDIO_OBJECT_TYPE_INDICATION = 0x40;
const AUDIO_STREAM_TYPE = 0x05;
/** AAC-LC, and the HE-AAC signalling objects (SBR, PS) some encoders write first. */
const AAC_AUDIO_OBJECT_TYPES = new Set([2, 5, 29]);

/** One MPEG-4 descriptor's tag and body range inside `bytes`, or undefined if it overruns. */
function readDescriptor(bytes: Uint8Array, offset: number): { tag: number; bodyStart: number; end: number } | undefined {
  const tag = bytes[offset];
  if (tag === undefined) return undefined;
  let length = 0;
  let cursor = offset + 1;
  for (let step = 0; step < 4; step += 1) {
    const byte = bytes[cursor];
    if (byte === undefined) return undefined;
    cursor += 1;
    length = (length << 7) | (byte & 0x7f);
    if ((byte & 0x80) === 0) {
      const end = cursor + length;
      return end <= bytes.byteLength ? { tag, bodyStart: cursor, end } : undefined;
    }
  }
  return undefined;
}

/**
 * Checks the decoder configuration inside an `esds` body is AAC audio: MPEG-4
 * audio object type 0x40, an audio stream, and an AudioSpecificConfig naming a
 * real AAC profile, sample-rate index and channel layout.
 */
function isAacEsds(body: Uint8Array): boolean {
  // version/flags(4), then the ES_Descriptor (tag 0x03).
  const es = readDescriptor(body, 4);
  if (!es || es.tag !== 0x03) return false;
  let cursor = es.bodyStart + 2; // ES_ID
  const flags = body[cursor];
  if (flags === undefined) return false;
  cursor += 1;
  if (flags & 0x80) cursor += 2; // streamDependenceFlag: dependsOn_ES_ID
  if (flags & 0x40) return false; // URL_flag: an external stream is not our upload
  if (flags & 0x20) cursor += 2; // OCRstreamFlag

  const config = readDescriptor(body, cursor);
  if (!config || config.tag !== 0x04 || config.end - config.bodyStart < 13) return false;
  if (body[config.bodyStart] !== MPEG4_AUDIO_OBJECT_TYPE_INDICATION) return false;
  if (((body[config.bodyStart + 1] ?? 0) >> 2) !== AUDIO_STREAM_TYPE) return false;

  // objectTypeIndication(1) streamType(1) bufferSizeDB(3) maxBitrate(4) avgBitrate(4)
  const specific = readDescriptor(body, config.bodyStart + 13);
  if (!specific || specific.tag !== 0x05 || specific.end - specific.bodyStart < 2) return false;
  const first = body[specific.bodyStart]!;
  const second = body[specific.bodyStart + 1]!;
  const audioObjectType = first >> 3;
  const samplingFrequencyIndex = ((first & 0x07) << 1) | (second >> 7);
  const channelConfiguration = (second >> 3) & 0x0f;
  return AAC_AUDIO_OBJECT_TYPES.has(audioObjectType)
    && samplingFrequencyIndex <= 12
    && channelConfiguration >= 1
    && channelConfiguration <= 7;
}

/**
 * stsd: exactly one `mp4a` sample entry that carries one AAC `esds`, and nothing
 * malformed around it. `body` is the start of the `stsd` body (possibly cut short by
 * the read window) and `stsdBodyLength` its real length. The entry must fit inside
 * both, so a declared size can't point past the box that holds it or past what was
 * read, and every child box must be well-formed up to the entry's declared end:
 * a player parses all of them, so a child that overruns or a stray partial box
 * would make the sample entry unreadable even when `esds` looks right.
 */
function isAacSampleDescription(body: Uint8Array, stsdBodyLength: number): boolean {
  if (readUint32BE(body, 4) !== 1) return false; // entry_count
  const entrySize = readUint32BE(body, 8);
  if (entrySize === undefined || entrySize < AUDIO_SAMPLE_ENTRY_FIXED_BYTES) return false;
  const entryEnd = 8 + entrySize;
  if (entryEnd > stsdBodyLength || entryEnd > body.byteLength) return false;
  if (readAscii(body, 12, 4) !== "mp4a") return false;
  if (readUint16BE(body, 22) !== 1) return false; // data_reference_index
  const channels = readUint16BE(body, 32);
  if (channels === undefined || channels < 1 || channels > 8) return false;
  if (readUint16BE(body, 34) !== 16) return false; // sample size in bits

  let configurations = 0;
  let offset = 8 + AUDIO_SAMPLE_ENTRY_FIXED_BYTES; // the entry's child boxes follow its fixed audio fields
  while (offset < entryEnd) {
    // A partial header at the end, a size of 0 or 1 (to-end or 64-bit), or a child
    // reaching past the entry are all malformed, not something to skip.
    if (offset + 8 > entryEnd) return false;
    const size = readUint32BE(body, offset);
    if (size === undefined || size < 8 || offset + size > entryEnd) return false;
    if (readAscii(body, offset + 4, 4) === "esds") {
      configurations += 1;
      if (!isAacEsds(body.subarray(offset + 8, offset + size))) return false;
    }
    offset += size;
  }
  return configurations === 1;
}

/** Reads a whole box body of at most `maxBytes`; undefined when it is empty, too large, or unreadable. */
async function readBoxBody(
  source: BoxSource,
  box: BoxHeader,
  tracker: BudgetTracker,
  maxBytes: number,
): Promise<Uint8Array | undefined> {
  const length = box.boxEnd - box.bodyStart;
  if (length <= 0 || length > maxBytes) return undefined;
  const body = await tracker.read(source, box.bodyStart, box.boxEnd - 1);
  return body && body.byteLength === length ? body : undefined;
}

/**
 * Verifies an audio track really describes AAC samples that exist in the file:
 * an `mp4a` sample entry with an AAC decoder config, and a sample table
 * (sample sizes, sample-to-chunk, chunk offsets, time-to-sample) that agrees
 * with itself and places every sample inside a non-empty `mdat`. Returns the
 * duration the sample table implies, or undefined when anything is off. Bounded:
 * every table is size-capped before it is read, and nothing but table bytes is read.
 */
async function verifyAacSampleTable(
  source: BoxSource,
  mdia: BoxHeader,
  timescale: number,
  mediaData: readonly BoxHeader[],
  tracker: BudgetTracker,
): Promise<number | undefined> {
  const minf = await findBoxInRange(source, mdia.bodyStart, mdia.boxEnd, "minf", tracker);
  if (!minf) return undefined;
  const stbl = await findBoxInRange(source, minf.bodyStart, minf.boxEnd, "stbl", tracker);
  if (!stbl) return undefined;
  const tables = await collectBoxes(source, stbl.bodyStart, stbl.boxEnd, ["stsd", "stts", "stsc", "stsz", "stco", "co64"], tracker);
  const stsd = tables.get("stsd");
  const stts = tables.get("stts");
  const stsc = tables.get("stsc");
  const stsz = tables.get("stsz");
  const chunkOffsets = tables.get("stco") ?? tables.get("co64");
  if (!stsd || !stts || !stsc || !stsz || !chunkOffsets) return undefined;

  // Sample description: AAC, not some other codec or an empty placeholder.
  const probeEnd = Math.min(stsd.bodyStart + AUDIO_SAMPLE_DESCRIPTION_PROBE_BYTES, stsd.boxEnd) - 1;
  if (probeEnd < stsd.bodyStart) return undefined;
  const description = await tracker.read(source, stsd.bodyStart, probeEnd);
  if (!description || !isAacSampleDescription(description, stsd.boxEnd - stsd.bodyStart)) return undefined;

  // stsz: every sample has a real, AAC-sized length.
  const sizeBody = await tracker.read(source, stsz.bodyStart, Math.min(stsz.bodyStart + 11, stsz.boxEnd - 1));
  const uniformSize = sizeBody ? readUint32BE(sizeBody, 4) : undefined;
  const sampleCount = sizeBody ? readUint32BE(sizeBody, 8) : undefined;
  if (uniformSize === undefined || sampleCount === undefined || sampleCount < 1 || sampleCount > MAX_AUDIO_SAMPLES) {
    return undefined;
  }
  let sizes: number[];
  if (uniformSize > 0) {
    sizes = Array.from({ length: sampleCount }, () => uniformSize);
  } else {
    if (stsz.boxEnd - stsz.bodyStart < 12 + 4 * sampleCount) return undefined;
    const table = await tracker.read(source, stsz.bodyStart + 12, stsz.bodyStart + 12 + 4 * sampleCount - 1);
    if (!table || table.byteLength !== 4 * sampleCount) return undefined;
    sizes = Array.from({ length: sampleCount }, (_, index) => readUint32BE(table, index * 4)!);
  }
  if (sizes.some((size) => size < 1 || size > MAX_AAC_SAMPLE_BYTES)) return undefined;

  // stts: the sample count and the total ticks the table claims.
  const timeBody = await readBoxBody(source, stts, tracker, 8 + 8 * MAX_STTS_ENTRIES);
  const timeEntries = timeBody ? readUint32BE(timeBody, 4) : undefined;
  if (!timeBody || timeEntries === undefined || timeEntries < 1 || timeBody.byteLength < 8 + 8 * timeEntries) {
    return undefined;
  }
  let timedSamples = 0;
  let ticks = 0;
  for (let index = 0; index < timeEntries; index += 1) {
    const count = readUint32BE(timeBody, 8 + index * 8)!;
    const delta = readUint32BE(timeBody, 12 + index * 8)!;
    if (count < 1 || delta < 1) return undefined;
    timedSamples += count;
    ticks += count * delta;
  }
  if (timedSamples !== sampleCount) return undefined;

  // stsc: how many samples each run of chunks holds (one sample description only).
  const mapBody = await readBoxBody(source, stsc, tracker, 8 + 12 * MAX_STSC_ENTRIES);
  const mapEntries = mapBody ? readUint32BE(mapBody, 4) : undefined;
  if (!mapBody || mapEntries === undefined || mapEntries < 1 || mapBody.byteLength < 8 + 12 * mapEntries) {
    return undefined;
  }
  const runs: Array<{ firstChunk: number; samplesPerChunk: number }> = [];
  for (let index = 0; index < mapEntries; index += 1) {
    const firstChunk = readUint32BE(mapBody, 8 + index * 12)!;
    const samplesPerChunk = readUint32BE(mapBody, 12 + index * 12)!;
    const descriptionIndex = readUint32BE(mapBody, 16 + index * 12)!;
    const previous = runs[index - 1];
    if (samplesPerChunk < 1 || descriptionIndex !== 1) return undefined;
    if (index === 0 ? firstChunk !== 1 : firstChunk <= previous!.firstChunk) return undefined;
    runs.push({ firstChunk, samplesPerChunk });
  }

  // stco / co64: where each chunk starts.
  const wide = chunkOffsets === tables.get("co64");
  const width = wide ? 8 : 4;
  const offsetBody = await readBoxBody(source, chunkOffsets, tracker, 8 + width * MAX_AUDIO_CHUNKS);
  const chunkCount = offsetBody ? readUint32BE(offsetBody, 4) : undefined;
  if (!offsetBody || chunkCount === undefined || chunkCount < 1 || offsetBody.byteLength < 8 + width * chunkCount) {
    return undefined;
  }

  // Every chunk's samples must lie wholly inside one non-empty mdat, and the
  // chunks must account for exactly the samples the size table lists.
  let sampleIndex = 0;
  let run = 0;
  for (let chunk = 1; chunk <= chunkCount; chunk += 1) {
    while (run + 1 < runs.length && runs[run + 1]!.firstChunk <= chunk) run += 1;
    const samplesInChunk = runs[run]!.samplesPerChunk;
    if (sampleIndex + samplesInChunk > sampleCount) return undefined;

    const entry = 8 + (chunk - 1) * width;
    const start = wide
      ? readUint32BE(offsetBody, entry)! * 2 ** 32 + readUint32BE(offsetBody, entry + 4)!
      : readUint32BE(offsetBody, entry)!;
    let length = 0;
    for (let sample = 0; sample < samplesInChunk; sample += 1) length += sizes[sampleIndex + sample]!;
    sampleIndex += samplesInChunk;

    const end = start + length;
    if (!Number.isSafeInteger(end) || !mediaData.some((data) => start >= data.bodyStart && end <= data.boxEnd)) {
      return undefined;
    }
  }
  if (sampleIndex !== sampleCount) return undefined;

  return ticks / timescale;
}

/** The track kind a file must be built around: `vide` for a video, `soun` for audio. */
export type IsoBmffHandlerType = "vide" | "soun";

/**
 * Bounded ISO-BMFF (MP4/QuickTime share this container format) duration reader.
 * Walks box *headers* only, jumping by each box's own declared size — never reads
 * a skipped box's body, so a well-formed file costs only a handful of tiny ranged
 * reads regardless of where `moov` sits (some encoders write `mdat` first). Fails
 * closed — never treats "couldn't determine duration" as a pass.
 *
 * `handlerType` names the track the duration is read from. Audio
 * (`soun`) must also contain no video track, so a video can't be passed off as a voice memo.
 */
export async function extractIsoBmffDurationSeconds(
  source: BoxSource,
  budget?: DurationBudget,
  handlerType: IsoBmffHandlerType = "vide",
): Promise<ExtractDurationResult> {
  try {
    const tracker = new BudgetTracker(
      budget ?? (handlerType === "soun" ? AUDIO_DURATION_BUDGET : DEFAULT_DURATION_BUDGET),
    );
    const moov = await findBoxInRange(source, 0, source.fileSize, "moov", tracker);
    if (!moov) return { outcome: "malformed" };

    const mvhd = await findBoxInRange(source, moov.bodyStart, moov.boxEnd, "mvhd", tracker);
    if (!mvhd) return { outcome: "malformed" };

    // A real capture always has at least one track — this alone is what keeps a
    // fabricated ftyp+moov+mvhd (no actual media content at all) from validating.
    const traks = await findAllBoxesInRange(source, moov.bodyStart, moov.boxEnd, "trak", tracker);
    if (traks.length === 0) return { outcome: "malformed" };

    // ...and its media payload actually exists somewhere: a non-empty top-level
    // `mdat`. Box-header-only, so this costs nothing beyond the handful of tiny
    // reads already budgeted for this walk.
    // An audio recording's sample table must point inside real media data, so it
    // needs every mdat; a video only needs one to exist.
    const mediaData = handlerType === "soun"
      ? (await findAllBoxesInRange(source, 0, source.fileSize, "mdat", tracker)).filter((box) => box.boxEnd > box.bodyStart)
      : [];
    const mdat = handlerType === "soun" ? mediaData[0] : await findBoxInRange(source, 0, source.fileSize, "mdat", tracker);
    if (!mdat || mdat.boxEnd <= mdat.bodyStart) return { outcome: "malformed" };

    const movieSeconds = await parseDurationBoxSeconds(source, mvhd, tracker);
    if (movieSeconds === undefined || !Number.isFinite(movieSeconds)) return { outcome: "malformed" };

    // mvhd's duration alone is just a declared header field with no structural
    // tie to the actual media — cross-check it against each matching track's OWN
    // media header (mdia/mdhd, same v0/v1 layout, in the track's timescale), so a
    // track can't outlast the header that was checked against the limit. Only tracks
    // of the wanted handler type are judged: another kind of track's duration can
    // legitimately diverge from mvhd, and the first trak isn't necessarily the one we want.
    // Every track of the wanted kind has to check out, not just the first: a
    // second one that disagrees with the movie header, or can't be read, would
    // otherwise be skipped and could run past the duration limit unseen. Tracks of
    // other kinds (sound under a video, timecode, metadata) are not ours to judge,
    // and a track with no media header can't be told apart from them.
    let trackSecondsMax: number | undefined;
    for (const trak of traks) {
      const mdia = await findBoxInRange(source, trak.bodyStart, trak.boxEnd, "mdia", tracker);
      if (!mdia) continue;
      const hdlr = await findBoxInRange(source, mdia.bodyStart, mdia.boxEnd, "hdlr", tracker);
      if (!hdlr) continue;
      const trackHandler = await readHandlerType(source, hdlr, tracker);
      // A video hidden inside an audio file is rejected outright.
      if (handlerType === "soun" && trackHandler === "vide") return { outcome: "malformed" };
      if (trackHandler !== handlerType) continue;

      const mdhd = await findBoxInRange(source, mdia.bodyStart, mdia.boxEnd, "mdhd", tracker);
      if (!mdhd) return { outcome: "malformed" };
      const times = await parseDurationBoxTimes(source, mdhd, tracker);
      if (!times) return { outcome: "malformed" };
      const trackSeconds = times.duration / times.timescale;
      if (!Number.isFinite(trackSeconds)) return { outcome: "malformed" };

      // The movie header covers the longest track, so a track can be shorter than it:
      // a camera clip's video routinely starts after its sound and ends before it, and
      // that is a gap of a second or more on real recordings. A track LONGER than the
      // header is what's inconsistent (the header understating the media), so only that
      // is refused. The duration reported below is still the longest any header claims,
      // so a short track can't hide a long movie from the limit.
      if (trackSeconds - movieSeconds > Math.max(1, trackSeconds * 0.05)) return { outcome: "malformed" };

      let acceptedSeconds = trackSeconds;
      if (handlerType === "soun") {
        // The headers agreeing proves nothing about the audio. The track must be
        // AAC and its sample table must account for real samples inside mdat, and
        // the duration that table implies must agree too; the longest wins, so a
        // header can't understate it.
        const sampleSeconds = await verifyAacSampleTable(source, mdia, times.timescale, mediaData, tracker);
        if (sampleSeconds === undefined || !Number.isFinite(sampleSeconds)) return { outcome: "malformed" };
        const sampleLarger = Math.max(trackSeconds, sampleSeconds);
        if (sampleLarger - Math.min(trackSeconds, sampleSeconds) > Math.max(1, sampleLarger * 0.05)) {
          return { outcome: "malformed" };
        }
        acceptedSeconds = sampleLarger;
      }
      trackSecondsMax = Math.max(trackSecondsMax ?? 0, acceptedSeconds);
    }
    if (trackSecondsMax === undefined) return { outcome: "malformed" };

    // The larger of mvhd and the agreeing track(s): never let one falsified
    // field alone understate the real duration relative to the duration limit.
    return { outcome: "duration", seconds: Math.max(movieSeconds, trackSecondsMax) };
  } catch (error) {
    if (error instanceof BudgetExceededError) return { outcome: "malformed" };
    throw error;
  }
}
