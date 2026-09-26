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

export function buildMoovBox(children: Uint8Array[]): Uint8Array {
  const totalChildBytes = children.reduce((sum, child) => sum + child.byteLength, 0);
  const moov = wrapBox("moov", new Uint8Array(totalChildBytes));
  let offset = 8;
  for (const child of children) {
    moov.set(child, offset);
    offset += child.byteLength;
  }
  return moov;
}

/** ftyp + moov(mvhd) — a minimal but structurally valid MP4 for a given duration. */
export function buildMinimalMp4(durationSeconds: number, timescale = 1000): Uint8Array {
  const ftyp = buildFtypBox("isom", ["isom"]);
  const mvhd = buildMvhdBoxV0({ timescale, duration: Math.round(durationSeconds * timescale) });
  const moov = buildMoovBox([mvhd]);
  return concatBoxes(ftyp, moov);
}

export const validJpegBytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);
