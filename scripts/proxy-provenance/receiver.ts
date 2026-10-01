import { selectBrowserSource } from "../../apps/web/lib/api/server/browser-proxy";
import { active, authorized, fingerprint, matchesSynthetic, response, samplePage, type DiagnosticEnv } from "./shared";

/** This imports the production selector but never forwards to the application. */
export async function observe(request: Request, env: DiagnosticEnv) {
  const source = selectBrowserSource(request);
  const connectingIp = request.headers.get("cf-connecting-ip");
  const realIp = request.headers.get("x-real-ip");
  const worker = request.headers.get("cf-worker");
  return {
    version: 1,
    observedAt: new Date().toISOString(),
    expiresAt: env.EXPIRES_AT,
    selectorAccepted: source.ok,
    sourceFamily: source.ok ? (source.sourceIp.includes(":") ? "ipv6" : "ipv4") : null,
    sourceKeyHash: await fingerprint(source.ok ? source.sourceIp : null, env.HASH_KEY),
    selectedSynthetic: matchesSynthetic(source.ok ? source.sourceIp : null),
    fixedCrossZoneIp: connectingIp?.toLowerCase() === "2a06:98c0:3600::103",
    cfWorker: worker === null ? "absent" : worker === env.EXPECTED_ZONE ? "same-zone" : "other",
    cfWorkerHash: await fingerprint(worker, env.HASH_KEY),
    xRealIpPresent: realIp !== null,
    xRealMatchesSelected: source.ok && realIp === source.sourceIp,
    xRealSynthetic: matchesSynthetic(realIp),
    forwardedPresent: request.headers.has("forwarded"),
    xForwardedForPresent: request.headers.has("x-forwarded-for"),
    xForwardedForSynthetic: matchesSynthetic(request.headers.get("x-forwarded-for")),
    cfConnectingIpv6Present: request.headers.has("cf-connecting-ipv6"),
  };
}

export default {
  async fetch(request: Request, env: DiagnosticEnv): Promise<Response> {
    if (!active(env)) return response({ error: "diagnostic_expired_or_unconfigured" }, 410);
    if (request.method !== "GET") return response({ error: "method_not_allowed" }, 405);
    const url = new URL(request.url);
    if (url.pathname === "/" && !url.search) return samplePage();
    if (url.pathname !== "/sample" || url.search || !authorized(request, env)) return response({ error: "not_found" }, 404);
    return response(await observe(request, env));
  },
};
