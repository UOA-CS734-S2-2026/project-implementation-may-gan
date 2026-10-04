import { createReadStream, statSync } from "node:fs";
import { createServer } from "node:http";
import { resolve, sep } from "node:path";

const [rootArgument, portArgument] = process.argv.slice(2);
if (!rootArgument || !portArgument) {
  console.error("Usage: node local-s3-media-server.mjs <root> <port>");
  process.exit(1);
}

const root = resolve(rootArgument);
const port = Number(portArgument);

function objectPath(url) {
  const parts = decodeURIComponent(new URL(url, "http://localhost").pathname).split("/").filter(Boolean);
  if (parts.length < 2 || parts.some((part) => part === "." || part === ".." || part.includes("\\"))) return null;
  const candidate = resolve(root, ...parts);
  return candidate.startsWith(`${root}${sep}`) ? candidate : null;
}

const server = createServer((request, response) => {
  if (request.url === "/health") {
    response.writeHead(200, { "content-type": "text/plain" });
    response.end("ok");
    return;
  }
  if (request.method !== "GET" && request.method !== "HEAD") {
    response.writeHead(405).end();
    return;
  }

  const path = objectPath(request.url ?? "/");
  if (!path) {
    response.writeHead(404).end();
    return;
  }

  let size;
  try {
    size = statSync(path).size;
  } catch {
    response.writeHead(404).end();
    return;
  }

  const headers = {
    "accept-ranges": "bytes",
    "cache-control": "no-store",
    "content-length": String(size),
    "content-type": path.endsWith(".png") ? "image/png" : "application/octet-stream",
  };
  response.writeHead(200, headers);
  if (request.method === "HEAD") response.end();
  else createReadStream(path).pipe(response);
});

server.listen(port, "127.0.0.1");

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
