/** Hand-built ISO-BMFF byte buffers for tests — never used outside test files. */

function writeUint32BE(bytes: Uint8Array, offset: number, value: number): void {
  bytes[offset] = (value >>> 24) & 0xff;
  bytes[offset + 1] = (value >>> 16) & 0xff;
  bytes[offset + 2] = (value >>> 8) & 0xff;
  bytes[offset + 3] = value & 0xff;
}

function writeAscii(bytes: Uint8Array, offset: number, text: string): void {
  for (let index = 0; index < text.length; index += 1) bytes[offset + index] = text.charCodeAt(index);
}

export function wrapBox(type: string, body: Uint8Array): Uint8Array {
  const box = new Uint8Array(8 + body.byteLength);
  writeUint32BE(box, 0, box.byteLength);
  writeAscii(box, 4, type);
  box.set(body, 8);
  return box;
}

export function concatBoxes(...boxes: Uint8Array[]): Uint8Array {
  const total = boxes.reduce((sum, box) => sum + box.byteLength, 0);
  const result = new Uint8Array(total);
  let offset = 0;
  for (const box of boxes) {
    result.set(box, offset);
    offset += box.byteLength;
  }
  return result;
}

export function buildFtypBox(majorBrand: string, compatibleBrands: string[] = [majorBrand]): Uint8Array {
  const box = new Uint8Array(16 + compatibleBrands.length * 4);
  writeUint32BE(box, 0, box.byteLength);
  writeAscii(box, 4, "ftyp");
  writeAscii(box, 8, majorBrand);
  writeUint32BE(box, 12, 0); // minor_version
  compatibleBrands.forEach((brand, index) => writeAscii(box, 16 + index * 4, brand));
  return box;
}

export function buildMvhdBoxV0({ timescale, duration }: { timescale: number; duration: number }): Uint8Array {
  const body = new Uint8Array(20); // version+flags(4) + creation(4) + modification(4) + timescale(4) + duration(4)
  writeUint32BE(body, 12, timescale);
  writeUint32BE(body, 16, duration);
  return wrapBox("mvhd", body);
}

export function buildMvhdBoxV1({ timescale, duration }: { timescale: number; duration: number }): Uint8Array {
  const body = new Uint8Array(32); // version+flags(4) + creation(8) + modification(8) + timescale(4) + duration(8)
  body[0] = 1;
  writeUint32BE(body, 20, timescale);
  writeUint32BE(body, 24, Math.floor(duration / 2 ** 32));
  writeUint32BE(body, 28, duration % 2 ** 32);
  return wrapBox("mvhd", body);
}

function wrapContainerBox(type: string, children: Uint8Array[]): Uint8Array {
  const totalChildBytes = children.reduce((sum, child) => sum + child.byteLength, 0);
  const box = wrapBox(type, new Uint8Array(totalChildBytes));
  let offset = 8;
  for (const child of children) {
    box.set(child, offset);
    offset += child.byteLength;
  }
  return box;
}

export function buildMoovBox(children: Uint8Array[]): Uint8Array {
  return wrapContainerBox("moov", children);
}

/** mdhd shares mvhd's exact v0 layout — see buildMvhdBoxV0. */
export function buildMdhdBoxV0({ timescale, duration }: { timescale: number; duration: number }): Uint8Array {
  const body = new Uint8Array(20);
  writeUint32BE(body, 12, timescale);
  writeUint32BE(body, 16, duration);
  return wrapBox("mdhd", body);
}

/** version/flags(4) + pre_defined(4) + handler_type(4) + reserved(12) + empty null-terminated name(1). */
export function buildHdlrBox(handlerType: string): Uint8Array {
  const body = new Uint8Array(25);
  writeAscii(body, 8, handlerType);
  return wrapBox("hdlr", body);
}

/** trak(mdia(mdhd, hdlr)) — the minimum real track structure extractIsoBmffDurationSeconds requires. */
export function buildTrakBox({
  timescale,
  duration,
  handlerType = "vide",
}: {
  timescale: number;
  duration: number;
  handlerType?: string;
}): Uint8Array {
  const mdhd = buildMdhdBoxV0({ timescale, duration });
  const mdia = wrapContainerBox("mdia", [mdhd, buildHdlrBox(handlerType)]);
  return wrapContainerBox("trak", [mdia]);
}

/**
 * ftyp + moov(mvhd, trak(mdia(mdhd, hdlr=vide))) + mdat — a minimal but
 * structurally *complete* MP4 for a given duration: a real capture always has a
 * video track with its own media header (cross-checked against mvhd) and a
 * non-empty media-data box, which is exactly what keeps a fabricated
 * ftyp+moov+mvhd (no real track or media data) from validating.
 */
export function buildMinimalMp4(durationSeconds: number, timescale = 1000, extraTracks: Uint8Array[] = []): Uint8Array {
  const ftyp = buildFtypBox("isom", ["isom"]);
  const duration = Math.round(durationSeconds * timescale);
  const mvhd = buildMvhdBoxV0({ timescale, duration });
  const trak = buildTrakBox({ timescale, duration });
  const moov = buildMoovBox([mvhd, trak, ...extraTracks]);
  const mdat = wrapBox("mdat", new Uint8Array([0, 1, 2, 3]));
  return concatBoxes(ftyp, moov, mdat);
}

function uint32BE(value: number): number[] {
  return [(value >>> 24) & 0xff, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff];
}

/** An MPEG-4 descriptor with a one-byte length, enough for every descriptor a test builds. */
function descriptor(tag: number, body: number[]): number[] {
  return [tag, body.length, ...body];
}

export interface EsdsOptions {
  objectTypeIndication?: number;
  /** The streamType byte: audio is 0x15 (type 5 in the high six bits). */
  streamType?: number;
  audioObjectType?: number;
  samplingFrequencyIndex?: number;
  channelConfiguration?: number;
}

/** esds: ES_Descriptor > DecoderConfigDescriptor > DecoderSpecificInfo (AudioSpecificConfig). Defaults are AAC-LC, 44.1 kHz, stereo. */
export function buildEsdsBox({
  objectTypeIndication = 0x40,
  streamType = 0x15,
  audioObjectType = 2,
  samplingFrequencyIndex = 4,
  channelConfiguration = 2,
}: EsdsOptions = {}): Uint8Array {
  const config = [
    (audioObjectType << 3) | (samplingFrequencyIndex >> 1),
    ((samplingFrequencyIndex & 1) << 7) | (channelConfiguration << 3),
  ];
  const decoderConfig = descriptor(0x04, [
    objectTypeIndication,
    streamType,
    0, 0, 0, // bufferSizeDB
    0, 0, 0, 0, // maxBitrate
    0, 0, 0, 0, // avgBitrate
    ...descriptor(0x05, config),
  ]);
  const esDescriptor = descriptor(0x03, [0, 1, 0, ...decoderConfig, ...descriptor(0x06, [2])]);
  return wrapBox("esds", new Uint8Array([0, 0, 0, 0, ...esDescriptor]));
}

/** An audio sample entry (`mp4a` unless overridden) followed by its child boxes. */
export function buildAudioSampleEntry(
  type: string,
  { channelCount = 2, sampleBits = 16 }: { channelCount?: number; sampleBits?: number },
  children: Uint8Array[],
): Uint8Array {
  const fields = new Uint8Array(28);
  fields[7] = 1; // data_reference_index, after six reserved bytes
  fields[17] = channelCount;
  fields[19] = sampleBits;
  fields[24] = 44_100 >> 8;
  fields[25] = 44_100 & 0xff; // sample rate, integer part of the 16.16 field
  return wrapBox(type, concatBoxes(fields, ...children));
}

/** A box whose declared size differs from the bytes written: `declaredSize` in its header, `bodyBytes` after it. */
export function buildBoxWithDeclaredSize(type: string, declaredSize: number, bodyBytes = 0): Uint8Array {
  const box = new Uint8Array(8 + bodyBytes);
  writeUint32BE(box, 0, declaredSize);
  writeAscii(box, 4, type);
  return box;
}

export function buildStsdBox(entry: Uint8Array): Uint8Array {
  return wrapBox("stsd", concatBoxes(new Uint8Array([0, 0, 0, 0, ...uint32BE(1)]), entry));
}

export function buildSttsBox(entries: Array<{ count: number; delta: number }>): Uint8Array {
  return wrapBox("stts", new Uint8Array([
    0, 0, 0, 0,
    ...uint32BE(entries.length),
    ...entries.flatMap(({ count, delta }) => [...uint32BE(count), ...uint32BE(delta)]),
  ]));
}

export function buildStscBox(runs: Array<{ firstChunk: number; samplesPerChunk: number; descriptionIndex?: number }>): Uint8Array {
  return wrapBox("stsc", new Uint8Array([
    0, 0, 0, 0,
    ...uint32BE(runs.length),
    ...runs.flatMap((run) => [...uint32BE(run.firstChunk), ...uint32BE(run.samplesPerChunk), ...uint32BE(run.descriptionIndex ?? 1)]),
  ]));
}

/** A uniform sample size, or an explicit table of per-sample sizes. */
export function buildStszBox(sizes: { uniform: number; count: number } | number[]): Uint8Array {
  if (Array.isArray(sizes)) {
    return wrapBox("stsz", new Uint8Array([0, 0, 0, 0, ...uint32BE(0), ...uint32BE(sizes.length), ...sizes.flatMap(uint32BE)]));
  }
  return wrapBox("stsz", new Uint8Array([0, 0, 0, 0, ...uint32BE(sizes.uniform), ...uint32BE(sizes.count)]));
}

export function buildStcoBox(offsets: number[]): Uint8Array {
  return wrapBox("stco", new Uint8Array([0, 0, 0, 0, ...uint32BE(offsets.length), ...offsets.flatMap(uint32BE)]));
}

export function buildCo64Box(offsets: number[]): Uint8Array {
  return wrapBox("co64", new Uint8Array([
    0, 0, 0, 0,
    ...uint32BE(offsets.length),
    ...offsets.flatMap((offset) => [...uint32BE(Math.floor(offset / 2 ** 32)), ...uint32BE(offset % 2 ** 32)]),
  ]));
}

/** trak(mdia(mdhd, hdlr=soun, minf(stbl(...tables)))) — a track whose sample tables a test supplies. */
export function buildAudioTrakBox({
  timescale,
  duration,
  tables,
}: {
  timescale: number;
  duration: number;
  tables: Uint8Array[];
}): Uint8Array {
  const minf = wrapContainerBox("minf", [wrapContainerBox("stbl", tables)]);
  const mdia = wrapContainerBox("mdia", [buildMdhdBoxV0({ timescale, duration }), buildHdlrBox("soun"), minf]);
  return wrapContainerBox("trak", [mdia]);
}

export interface M4aOptions {
  /** Sample entry type; anything but `mp4a` is not AAC. */
  sampleEntryType?: string;
  /** The esds box; `null` leaves the sample entry without one. */
  esds?: Uint8Array | null;
  /** Further child boxes written inside the sample entry, after `esds`. */
  entryChildren?: Uint8Array[];
  /** Filler bytes at the end of the sample entry, inside its declared size. */
  entryTrailingBytes?: number;
  /** Added to the sample entry's declared size, so it no longer matches its contents. */
  entrySizeDelta?: number;
  channelCount?: number;
  sampleBits?: number;
  /** Bytes per sample (default 16), or one size per sample. */
  sampleSize?: number | number[];
  /** Samples in each chunk, in order (default: one chunk holding every sample). */
  chunks?: number[];
  /** Write 64-bit chunk offsets (`co64`) instead of `stco`. */
  wideOffsets?: boolean;
  /** Added to every chunk offset, to point outside the media data. */
  chunkOffsetShift?: number;
  /** Bytes in `mdat` (default: exactly the samples' bytes). */
  mdatBytes?: number;
  /** Total ticks `stts` claims (default: the track's duration). */
  sttsTicks?: number;
  /** Sample count `stts` claims (default: the real count). */
  sttsSamples?: number;
  /** Sample count `stsz` claims when sizes are uniform (default: the real count). */
  stszCount?: number;
  /** Tables to leave out of the sample table. */
  omit?: Array<"stsd" | "stts" | "stsc" | "stsz" | "stco">;
  /** What the movie header (mvhd) claims, when it should differ from the track. */
  movieSeconds?: number;
  /** Further tracks written after the audio track, such as a video track. */
  extraTracks?: Uint8Array[];
  /** How many identical audio tracks to write (default 1); each points at the same samples. */
  audioTrackCount?: number;
}

/**
 * ftyp(M4A) + moov(mvhd, trak(mdia(mdhd, hdlr=soun, minf(stbl)))) + mdat — a
 * structurally complete AAC audio MP4 of a given duration: an `mp4a` sample
 * entry with an AAC `esds`, sample tables that agree with each other, and an
 * `mdat` that holds every sample they place. The payload bytes are filler, not
 * decodable audio. Options each break one part, to test that it is checked.
 */
export function buildMinimalM4a(durationSeconds: number, trackTimescale = 44_100, options: M4aOptions = {}): Uint8Array {
  const frameTicks = 1024;
  const ticks = Math.round(durationSeconds * trackTimescale);
  const sampleCount = Math.max(1, Math.ceil(ticks / frameTicks));
  const sizes = Array.isArray(options.sampleSize)
    ? options.sampleSize
    : Array.from({ length: sampleCount }, () => (options.sampleSize as number | undefined) ?? 16);
  const chunks = options.chunks ?? [sampleCount];
  const mdatBytes = options.mdatBytes ?? sizes.reduce((sum, size) => sum + size, 0);

  const buildTables = (firstChunkOffset: number): Uint8Array[] => {
    const entry = buildAudioSampleEntry(
      options.sampleEntryType ?? "mp4a",
      { channelCount: options.channelCount, sampleBits: options.sampleBits },
      [
        ...(options.esds === null ? [] : [options.esds ?? buildEsdsBox()]),
        ...(options.entryChildren ?? []),
        ...(options.entryTrailingBytes ? [new Uint8Array(options.entryTrailingBytes)] : []),
      ],
    );
    if (options.entrySizeDelta) {
      const declared = new DataView(entry.buffer, entry.byteOffset, 4);
      declared.setUint32(0, declared.getUint32(0) + options.entrySizeDelta);
    }
    let sample = 0;
    let offset = firstChunkOffset;
    const chunkOffsets = chunks.map((samples) => {
      const start = offset + (options.chunkOffsetShift ?? 0);
      for (let index = 0; index < samples; index += 1) offset += sizes[sample + index] ?? 0;
      sample += samples;
      return start;
    });
    // One run per change in samples-per-chunk, as encoders write it.
    const runs: Array<{ firstChunk: number; samplesPerChunk: number }> = [];
    chunks.forEach((samples, index) => {
      if (runs.at(-1)?.samplesPerChunk !== samples) runs.push({ firstChunk: index + 1, samplesPerChunk: samples });
    });
    const claimedSamples = options.sttsSamples ?? sampleCount;
    const claimedTicks = options.sttsTicks ?? ticks;
    const tail = claimedTicks - (claimedSamples - 1) * frameTicks;
    const time = claimedSamples > 1
      ? [{ count: claimedSamples - 1, delta: frameTicks }, { count: 1, delta: Math.max(1, tail) }]
      : [{ count: 1, delta: Math.max(1, claimedTicks) }];

    const tables: Record<string, Uint8Array> = {
      stsd: buildStsdBox(entry),
      stts: buildSttsBox(time),
      stsc: buildStscBox(runs),
      stsz: Array.isArray(options.sampleSize)
        ? buildStszBox(options.sampleSize)
        : buildStszBox({ uniform: (options.sampleSize as number | undefined) ?? 16, count: options.stszCount ?? sampleCount }),
      stco: options.wideOffsets ? buildCo64Box(chunkOffsets) : buildStcoBox(chunkOffsets),
    };
    return Object.entries(tables)
      .filter(([name]) => !(options.omit as string[] | undefined)?.includes(name))
      .map(([, box]) => box);
  };

  const ftyp = buildFtypBox("M4A ", ["M4A ", "mp42", "isom"]);
  const mvhd = buildMvhdBoxV0({
    timescale: 1000,
    duration: Math.round((options.movieSeconds ?? durationSeconds) * 1000),
  });
  const buildMoov = (firstChunkOffset: number) => buildMoovBox([
    mvhd,
    ...Array.from({ length: options.audioTrackCount ?? 1 }, () => (
      buildAudioTrakBox({ timescale: trackTimescale, duration: ticks, tables: buildTables(firstChunkOffset) })
    )),
    ...(options.extraTracks ?? []),
  ]);
  // The chunk offsets are absolute, and the moov that holds them sits before mdat
  // but has the same length whatever they are, so one trial build fixes the layout.
  const firstChunkOffset = ftyp.byteLength + buildMoov(0).byteLength + 8;
  const payload = new Uint8Array(mdatBytes).fill(0x21);
  return concatBoxes(ftyp, buildMoov(firstChunkOffset), wrapBox("mdat", payload));
}

/** SOI...EOI — a real JPEG has both; a payload that only starts with the marker doesn't. */
export const validJpegBytes = new Uint8Array([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0xff, 0xd9,
]);
