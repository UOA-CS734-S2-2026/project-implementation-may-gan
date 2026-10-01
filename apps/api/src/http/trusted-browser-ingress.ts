const browserSourceHeader = "x-dayli-browser-source";
const privateRequestIdHeader = "x-dayli-browser-request-id";

const untrustedForwardingHeaders = new Set([
  "cf-connecting-ip",
  "cf-ipcountry",
  "cf-ray",
  "forwarded",
  "x-forwarded-for",
  "x-forwarded-host",
  "x-forwarded-proto",
  "x-real-ip",
  browserSourceHeader,
  privateRequestIdHeader,
]);

export interface TrustedBrowserIngress {
  sourceIp: string;
  requestId: string;
}

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

function isValidRequestId(value: string): boolean {
  return /^[a-zA-Z0-9_-]{16,128}$/.test(value);
}

/**
 * Accept context only at the named service-binding entrypoint. The public HTTP
 * handler never calls this function, so a client-supplied header cannot select
 * an ingress identity.
 */
export function readTrustedBrowserIngress(request: Request): TrustedBrowserIngress | undefined {
  const sourceIp = request.headers.get(browserSourceHeader);
  const requestId = request.headers.get(privateRequestIdHeader);
  if (!sourceIp || !requestId || !(isValidIpv4(sourceIp) || isValidIpv6(sourceIp)) || !isValidRequestId(requestId)) {
    return undefined;
  }
  return { sourceIp, requestId };
}

/**
 * The API's existing Better Auth and ingress limiter read cf-connecting-ip.
 * Set it only after the private binding entrypoint validates its context.
 */
export function createTrustedBrowserIngressRequest(request: Request, apiOrigin?: string): Request | undefined {
  const ingress = readTrustedBrowserIngress(request);
  if (!ingress) return undefined;

  const headers = new Headers(request.headers);
  for (const name of [...headers.keys()]) {
    if (untrustedForwardingHeaders.has(name.toLowerCase()) || name.toLowerCase().startsWith("cf-")) {
      headers.delete(name);
    }
  }
  headers.set("cf-connecting-ip", ingress.sourceIp);

  const target = apiOrigin
    ? new URL(`${new URL(request.url).pathname}${new URL(request.url).search}`, apiOrigin)
    : request.url;
  return new Request(target, {
    method: request.method,
    headers,
    body: request.body,
    redirect: "manual",
    signal: request.signal,
  });
}

export const trustedBrowserIngressHeaders = {
  source: browserSourceHeader,
  requestId: privateRequestIdHeader,
} as const;
