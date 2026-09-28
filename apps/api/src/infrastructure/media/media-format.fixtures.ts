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
export function buildMinimalMp4(durationSeconds: number, timescale = 1000): Uint8Array {
  const ftyp = buildFtypBox("isom", ["isom"]);
  const duration = Math.round(durationSeconds * timescale);
  const mvhd = buildMvhdBoxV0({ timescale, duration });
  const trak = buildTrakBox({ timescale, duration });
  const moov = buildMoovBox([mvhd, trak]);
  const mdat = wrapBox("mdat", new Uint8Array([0, 1, 2, 3]));
  return concatBoxes(ftyp, moov, mdat);
}

/** SOI...EOI — a real JPEG has both; a payload that only starts with the marker doesn't. */
export const validJpegBytes = new Uint8Array([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0xff, 0xd9,
]);
