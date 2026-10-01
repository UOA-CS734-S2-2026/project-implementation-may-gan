export interface ApiTransport {
  fetch(request: Request): Promise<Response>;
}

const privateSourceHeader = "x-dayli-browser-source";
const privateRequestIdHeader = "x-dayli-browser-request-id";
const hopByHopHeaders = new Set([
  "connection",
  "host",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
]);
const forwardingHeaders = new Set([
  "forwarded",
  "x-forwarded-for",
  "x-forwarded-host",
  "x-forwarded-proto",
  "x-real-ip",
  privateSourceHeader,
  privateRequestIdHeader,
]);

export type BrowserSourceSelection =
  | { ok: true; sourceIp: string }
  | { ok: false };

function isValidIpv4(value: string): boolean {
  const parts = value.split(".");
  return parts.length === 4 && parts.every((part) => /^(0|[1-9]\d{0,2})$/.test(part) && Number(part) <= 255);
}

function isValidIpv6(value: string): boolean {
  if (value.length > 45 || !/^[0-9a-f:]+$/i.test(value)) return false;
  const groups = value.split("::");
  if (groups.length > 2) return false;
  const count = groups.reduce((total, group) => total + (group ? group.split(":").length : 0), 0);
  return groups.every((group) => !group || group.split(":").every((part) => /^[0-9a-f]{1,4}$/i.test(part)))
    && (groups.length === 2 ? count < 8 : count === 8);
}

/**
 * Direct ingress uses Cloudflare's cf-connecting-ip. Incoming Worker fetches
 * carry cf-worker and must be rejected: a same-zone caller can choose the
 * downstream IP through x-real-ip. Never reject x-real-ip alone; direct traffic
 * legitimately carries it. The private service-binding hop happens afterward.
 */
export function selectBrowserSource(request: Request): BrowserSourceSelection {
  if (request.headers.has("cf-worker")) return { ok: false };
  const sourceIp = request.headers.get("cf-connecting-ip");
  return sourceIp && (isValidIpv4(sourceIp) || isValidIpv6(sourceIp))
    ? { ok: true, sourceIp }
    : { ok: false };
}

function proxyHeaders(request: Request, sourceIp: string): Headers {
  const headers = new Headers(request.headers);
  for (const name of [...headers.keys()]) {
    const normalized = name.toLowerCase();
    if (hopByHopHeaders.has(normalized) || forwardingHeaders.has(normalized) || normalized.startsWith("cf-")) {
      headers.delete(name);
    }
  }
  headers.set(privateSourceHeader, sourceIp);
  headers.set(privateRequestIdHeader, crypto.randomUUID().replaceAll("-", ""));
  return headers;
}

function unavailableResponse(): Response {
  return Response.json({ error: { code: "SERVICE_UNAVAILABLE" } }, {
    status: 503,
    headers: { "Cache-Control": "no-store" },
  });
}

function rejectedUpgradeResponse(): Response {
  return Response.json({ error: { code: "UPGRADE_NOT_SUPPORTED" } }, {
    status: 426,
    headers: { "Cache-Control": "no-store" },
  });
}

function noStoreResponse(response: Response): Response {
  const headers = new Headers(response.headers);
  headers.set("Cache-Control", "no-store");
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

/**
 * Forward one browser REST or auth request through the fixed private binding.
 * The request body stays as a stream and redirects remain visible to the
 * browser. WebSocket upgrades and arbitrary destinations are not supported.
 */
export async function forwardBrowserApiRequest(request: Request, transport: ApiTransport | undefined): Promise<Response> {
  const pathname = new URL(request.url).pathname;
  if (!pathname.startsWith("/api/")) return new Response(null, { status: 404 });
  if (request.headers.has("cf-worker")) return Response.json({ error: { code: "WORKER_ORIGIN_NOT_ALLOWED" } }, {
    status: 403,
    headers: { "Cache-Control": "no-store" },
  });
  if (request.headers.has("upgrade")) return rejectedUpgradeResponse();
  if (!transport) return unavailableResponse();

  const source = selectBrowserSource(request);
  if (!source.ok) return unavailableResponse();

  const init: RequestInit & { duplex?: "half" } = {
    method: request.method,
    headers: proxyHeaders(request, source.sourceIp),
    redirect: "manual",
    signal: request.signal,
  };
  if (request.method !== "GET" && request.method !== "HEAD" && request.body) {
    init.body = request.body;
    init.duplex = "half";
  }

  const upstreamRequest = new Request(request.url, init);
  return noStoreResponse(await transport.fetch(upstreamRequest));
}
