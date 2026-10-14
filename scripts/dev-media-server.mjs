#!/usr/bin/env node
// Local, loopback-only stand-in for the parts of Cloudflare R2's S3 API that the
// Dayli API uses: presigned PUT uploads, ranged GET/HEAD reads, and DELETE.
//
// This is a development convenience, not a security boundary. It does not
// verify S3 signatures, so it binds to 127.0.0.1 only and must never be exposed
// on a LAN or deployed. Objects live under the developer's local state
// directory, outside Git. The isolated e2e fixture in scripts/fixtures keeps its
// own read-only server; this one is for `pnpm dev:api:https` and `pnpm dev:media`.
//
// Usage: node scripts/dev-media-server.mjs [root] [port]
import { createReadStream, createWriteStream, linkSync, mkdirSync, readFileSync, rmSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { openSync, readSync, closeSync } from "node:fs";
import { createServer } from "node:http";
import { homedir } from "node:os";
import { dirname, join, resolve, sep } from "node:path";
import { randomBytes } from "node:crypto";

const defaultRoot = join(process.env.XDG_STATE_HOME || join(homedir(), ".local", "state"), "dayli", "media");
const root = resolve(process.argv[2] || process.env.DAYLI_MEDIA_ROOT || defaultRoot);
const port = Number(process.argv[3] || process.env.DAYLI_MEDIA_PORT || 8788);
const maxUploadBytes = 30 * 1024 * 1024;
// Browser uploads from the local web app are cross-origin; native apps ignore CORS.
const allowedOrigins = new Set(["https://localhost:3000"]);

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  console.error("Usage: node scripts/dev-media-server.mjs [root] [port]");
  process.exit(1);
}
mkdirSync(root, { recursive: true });

/** `/<bucket>/<key...>` → an absolute path inside root, or null. Keys are opaque, slash-separated, dot-free segments. */
function objectPath(url) {
  let pathname;
  try {
    pathname = new URL(url, "http://localhost").pathname;
  } catch {
    return null;
  }
  const parts = pathname.split("/").filter(Boolean).map((part) => {
    try {
      return decodeURIComponent(part);
    } catch {
      return null;
    }
  });
  if (parts.length < 2 || parts.some((part) => part === null || !/^[A-Za-z0-9_-]{1,128}$/.test(part))) return null;
  const candidate = resolve(root, ...parts);
  return candidate.startsWith(`${root}${sep}`) ? candidate : null;
}

const metaPath = (path) => `${path}.meta.json`;

function sniffContentType(path) {
  const header = Buffer.alloc(16);
  let length = 0;
  try {
    const fd = openSync(path, "r");
    try {
      length = readSync(fd, header, 0, 16, 0);
    } finally {
      closeSync(fd);
    }
  } catch {
    return "application/octet-stream";
  }
  const bytes = header.subarray(0, length);
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (bytes.toString("latin1", 0, 4) === "RIFF" && bytes.toString("latin1", 8, 12) === "WEBP") return "image/webp";
  if (bytes.toString("latin1", 4, 8) === "ftyp") {
    const brand = bytes.toString("latin1", 8, 12);
    if (brand.startsWith("hei") || brand === "mif1") return "image/heic";
    if (brand === "qt  ") return "video/quicktime";
    if (brand.startsWith("M4A")) return "audio/mp4";
    return "video/mp4";
  }
  return "application/octet-stream";
}

function contentTypeFor(path) {
  try {
    const meta = JSON.parse(readFileSync(metaPath(path), "utf8"));
    if (typeof meta.contentType === "string" && meta.contentType.length > 0) return meta.contentType;
  } catch {
    // Seeded objects have no sidecar; fall through to sniffing.
  }
  return sniffContentType(path);
}

/** Parse one `bytes=` range. Returns null for no/unsupported range, "invalid" for unsatisfiable. */
function parseRange(header, size) {
  if (!header) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match || (match[1] === "" && match[2] === "")) return null;
  let start;
  let end;
  if (match[1] === "") {
    const suffix = Number(match[2]);
    if (suffix === 0) return "invalid";
    start = Math.max(0, size - suffix);
    end = size - 1;
  } else {
    start = Number(match[1]);
    end = match[2] === "" ? size - 1 : Math.min(Number(match[2]), size - 1);
  }
  if (start >= size || start > end) return "invalid";
  return { start, end };
}

function corsHeaders(request) {
  const origin = request.headers.origin;
  if (!origin || !allowedOrigins.has(origin)) return {};
  return {
    "access-control-allow-origin": origin,
    "access-control-allow-methods": "GET, HEAD, PUT",
    "access-control-allow-headers": "content-type, if-none-match, range",
    "access-control-expose-headers": "content-length, content-range, etag",
    "access-control-allow-private-network": "true",
    vary: "origin",
  };
}

function send(response, status, headers = {}, body) {
  response.writeHead(status, headers);
  response.end(body);
}

function handlePut(request, response, path, cors) {
  const declaredLength = Number(request.headers["content-length"]);
  if (!Number.isInteger(declaredLength) || declaredLength < 0 || declaredLength > maxUploadBytes) {
    request.resume();
    send(response, 400, cors);
    return;
  }
  const createOnly = request.headers["if-none-match"] === "*";
  const contentType = String(request.headers["content-type"] || "application/octet-stream");
  mkdirSync(dirname(path), { recursive: true });
  const temporary = `${path}.${randomBytes(6).toString("hex")}.upload`;
  const output = createWriteStream(temporary, { flags: "wx" });
  let received = 0;
  let failed = false;
  const fail = (status) => {
    if (failed) return;
    failed = true;
    output.destroy();
    rmSync(temporary, { force: true });
    send(response, status, cors);
  };
  request.on("data", (chunk) => {
    received += chunk.length;
    if (received > declaredLength) {
      request.destroy();
      fail(400);
    }
  });
  request.on("error", () => fail(400));
  output.on("error", () => fail(500));
  output.on("finish", () => {
    if (failed) return;
    if (received !== declaredLength) {
      fail(400);
      return;
    }
    try {
      writeFileSync(metaPath(temporary), JSON.stringify({ contentType }));
      if (createOnly) {
        // link() fails if the target exists, so the first completed PUT wins, like R2's conditional write.
        linkSync(temporary, path);
        unlinkSync(temporary);
      } else {
        rmSync(path, { force: true });
        linkSync(temporary, path);
        unlinkSync(temporary);
      }
      writeFileSync(metaPath(path), JSON.stringify({ contentType }));
      rmSync(metaPath(temporary), { force: true });
      send(response, 200, { ...cors, etag: `"${statSync(path).size.toString(16)}-${Date.now().toString(16)}"` });
    } catch (error) {
      rmSync(temporary, { force: true });
      rmSync(metaPath(temporary), { force: true });
      if (error && error.code === "EEXIST") send(response, 412, cors);
      else send(response, 500, cors);
    }
  });
  request.pipe(output);
}

function handleRead(request, response, path, cors) {
  let stats;
  try {
    stats = statSync(path);
    if (!stats.isFile()) throw new Error("not a file");
  } catch {
    send(response, 404, cors);
    return;
  }
  const size = stats.size;
  const headers = {
    ...cors,
    "accept-ranges": "bytes",
    "cache-control": "no-store",
    "content-type": contentTypeFor(path),
    etag: `"${size.toString(16)}-${Math.floor(stats.mtimeMs).toString(16)}"`,
    "last-modified": stats.mtime.toUTCString(),
  };
  const range = parseRange(request.headers.range, size);
  if (range === "invalid") {
    send(response, 416, { ...cors, "content-range": `bytes */${size}` });
    return;
  }
  if (range) {
    response.writeHead(206, { ...headers, "content-length": String(range.end - range.start + 1), "content-range": `bytes ${range.start}-${range.end}/${size}` });
    if (request.method === "HEAD") response.end();
    else createReadStream(path, { start: range.start, end: range.end }).pipe(response);
    return;
  }
  response.writeHead(200, { ...headers, "content-length": String(size) });
  if (request.method === "HEAD") response.end();
  else createReadStream(path).pipe(response);
}

const server = createServer((request, response) => {
  const cors = corsHeaders(request);
  if (request.url === "/health") {
    send(response, 200, { "content-type": "text/plain" }, "ok");
    return;
  }
  if (request.method === "OPTIONS") {
    send(response, 204, cors);
    return;
  }
  const path = objectPath(request.url ?? "/");
  if (!path) {
    request.resume();
    send(response, 404, cors);
    return;
  }
  switch (request.method) {
    case "PUT":
      handlePut(request, response, path, cors);
      return;
    case "GET":
    case "HEAD":
      handleRead(request, response, path, cors);
      return;
    case "DELETE":
      rmSync(path, { force: true });
      rmSync(metaPath(path), { force: true });
      send(response, 204, cors);
      return;
    default:
      request.resume();
      send(response, 405, cors);
  }
});

server.on("error", (error) => {
  if (error.code === "EADDRINUSE") console.error(`Port ${port} is already in use. Is another local media store running?`);
  else console.error(`Local media store failed: ${error.message}`);
  process.exit(1);
});

server.listen(port, "127.0.0.1", () => {
  console.log(`Local media store (S3 mock) listening on http://127.0.0.1:${port}, storing objects in ${root}`);
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
