import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { deflateSync } from "node:zlib";
import type { Random } from "./random";

/**
 * Demo photos for the local seed. Real photos come from Lorem Picsum
 * (https://picsum.photos, free to use under the Unsplash licence) and are
 * cached outside Git, so only the first run needs a network. If a download
 * fails the seed falls back to generated gradient PNGs and never aborts.
 */
export interface DemoPhoto {
  path: string;
  contentType: "image/jpeg" | "image/png";
  byteSize: number;
}

export interface PhotoLibrary {
  posts: DemoPhoto[];
  avatars: DemoPhoto[];
  downloaded: number;
  generated: number;
}

/** Fixed Lorem Picsum IDs: landscapes, food, city, nature, objects. */
const POST_PHOTO_IDS = [
  10, 11, 13, 14, 15, 16, 17, 18, 19, 20, 22, 24, 25, 26, 27, 28, 29, 36, 37, 39,
  42, 43, 48, 49, 50, 54, 55, 56, 57, 58, 59, 60, 61, 63, 65, 66, 68, 69, 70, 71,
  74, 75, 76, 77, 78, 82, 83, 84, 88, 89, 90, 96, 99, 100, 101, 102, 103, 104, 106, 107,
  108, 110, 111, 112, 113, 116, 117, 118, 119, 120, 122, 124, 128, 129, 130, 131, 133, 134, 135, 137,
] as const;

/** Square crops for avatars: people, pets, and close-ups. */
const AVATAR_PHOTO_IDS = [
  64, 91, 129, 177, 203, 219, 237, 244, 257, 275, 287, 292, 305, 312, 319, 325, 338, 342, 349, 364,
  375, 399, 433, 447, 453, 473, 494, 513, 550, 577, 582, 593, 628, 646, 659, 669, 683, 718, 787, 823,
] as const;

const GRADIENTS: ReadonlyArray<readonly [readonly [number, number, number], readonly [number, number, number]]> = [
  [[255, 183, 94], [237, 143, 3]], [[86, 204, 242], [47, 128, 237]], [[168, 224, 99], [86, 171, 47]],
  [[247, 151, 30], [255, 210, 0]], [[238, 156, 167], [255, 221, 225]], [[67, 206, 162], [24, 90, 157]],
  [[255, 95, 109], [255, 195, 113]], [[142, 45, 226], [74, 0, 224]], [[0, 180, 219], [0, 131, 176]],
  [[252, 74, 26], [247, 183, 51]], [[17, 153, 142], [56, 239, 125]], [[189, 195, 199], [44, 62, 80]],
];

async function download(url: string, target: string): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20_000);
  try {
    const response = await fetch(url, { signal: controller.signal, redirect: "follow" });
    if (!response.ok) return false;
    const bytes = Buffer.from(await response.arrayBuffer());
    // Only keep a real JPEG; anything else (an HTML error page) falls back.
    if (bytes.length < 1024 || bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[2] !== 0xff) return false;
    writeFileSync(target, bytes);
    return true;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

async function mapWithConcurrency<T, R>(items: readonly T[], limit: number, work: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await work(items[index]!);
    }
  });
  await Promise.all(workers);
  return results;
}

// --- Minimal PNG encoder for the offline fallback --------------------------

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buffer: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = CRC_TABLE[(crc ^ byte) & 0xff]! ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const typeAndData = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typeAndData));
  return Buffer.concat([length, typeAndData, crc]);
}

function gradientPng(width: number, height: number, from: readonly number[], to: readonly number[]): Buffer {
  const rowLength = width * 3 + 1;
  const raw = Buffer.alloc(rowLength * height);
  for (let y = 0; y < height; y += 1) {
    raw[y * rowLength] = 0;
    for (let x = 0; x < width; x += 1) {
      const t = (x / width + y / height) / 2;
      const offset = y * rowLength + 1 + x * 3;
      raw[offset] = Math.round(from[0]! + (to[0]! - from[0]!) * t);
      raw[offset + 1] = Math.round(from[1]! + (to[1]! - from[1]!) * t);
      raw[offset + 2] = Math.round(from[2]! + (to[2]! - from[2]!) * t);
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // bit depth
  header[9] = 2; // truecolour RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function generatedPhotos(cacheDir: string, kind: "post" | "avatar"): DemoPhoto[] {
  const [width, height] = kind === "post" ? [720, 900] : [400, 400];
  return GRADIENTS.map(([from, to], index) => {
    const path = join(cacheDir, `generated-${kind}-${index}-${width}x${height}.png`);
    if (!existsSync(path)) writeFileSync(path, gradientPng(width, height, from, to));
    return { path, contentType: "image/png" as const, byteSize: statSync(path).size };
  });
}

function cachedJpeg(path: string): DemoPhoto | null {
  try {
    const head = readFileSync(path).subarray(0, 3);
    if (head[0] !== 0xff || head[1] !== 0xd8 || head[2] !== 0xff) return null;
    return { path, contentType: "image/jpeg", byteSize: statSync(path).size };
  } catch {
    return null;
  }
}

export async function preparePhotoLibrary(cacheDir: string, options: { offline: boolean; log: (message: string) => void }): Promise<PhotoLibrary> {
  mkdirSync(cacheDir, { recursive: true });
  let downloaded = 0;
  const fetchSet = async (ids: readonly number[], width: number, height: number): Promise<DemoPhoto[]> => {
    const results = await mapWithConcurrency(ids, 8, async (id) => {
      const path = join(cacheDir, `picsum-${id}-${width}x${height}.jpg`);
      const cached = cachedJpeg(path);
      if (cached) return cached;
      if (options.offline) return null;
      if (await download(`https://picsum.photos/id/${id}/${width}/${height}.jpg`, path)) {
        downloaded += 1;
        return cachedJpeg(path);
      }
      return null;
    });
    return results.filter((photo): photo is DemoPhoto => photo !== null);
  };

  if (!options.offline) options.log("Preparing demo photos from Lorem Picsum (cached after the first run)…");
  let posts = await fetchSet(POST_PHOTO_IDS, 1080, 1350);
  let avatars = await fetchSet(AVATAR_PHOTO_IDS, 400, 400);
  let generated = 0;
  if (posts.length < 10) {
    options.log("Couldn't get enough Lorem Picsum photos; using generated gradient images for posts.");
    const fallback = generatedPhotos(cacheDir, "post");
    generated += fallback.length;
    posts = [...posts, ...fallback];
  }
  if (avatars.length < 10) {
    const fallback = generatedPhotos(cacheDir, "avatar");
    generated += fallback.length;
    avatars = [...avatars, ...fallback];
  }
  return { posts, avatars, downloaded, generated };
}

export function pickPhotos(random: Random, library: readonly DemoPhoto[], count: number): DemoPhoto[] {
  return random.sample(library, count);
}
