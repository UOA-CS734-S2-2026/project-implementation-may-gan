import { active, authorized, response, syntheticSources, type DiagnosticEnv } from "./shared";

export const variants = ["baseline", "x-real-a", "x-real-b", "remove-worker", "forge-worker", "forge-forwarded"] as const;
export type Variant = typeof variants[number];

export function probeHeaders(variant: Variant, token: string): Headers {
  // Deliberately do not forward inbound cookies, request headers, or user URLs.
  const headers = new Headers({ authorization: `Bearer ${token}` });
  if (variant !== "baseline") headers.set("x-real-ip", variant === "x-real-b" ? syntheticSources.b : syntheticSources.a);
  if (variant === "remove-worker") headers.delete("cf-worker");
  if (variant === "forge-worker") headers.set("cf-worker", "forged.invalid");
  if (variant === "forge-forwarded") {
    headers.set("cf-connecting-ip", syntheticSources.b);
    headers.set("x-forwarded-for", syntheticSources.b);
    headers.set("forwarded", `for=${syntheticSources.b};proto=https`);
  }
  return headers;
}

export default {
  async fetch(request: Request, env: DiagnosticEnv): Promise<Response> {
    if (!active(env)) return response({ error: "diagnostic_expired_or_unconfigured" }, 410);
    if (request.method !== "GET") return response({ error: "method_not_allowed" }, 405);
    const url = new URL(request.url);
    const variant = url.searchParams.get("variant") ?? "baseline";
    if (url.pathname !== "/run" || !authorized(request, env) || !variants.includes(variant as Variant)
      || [...url.searchParams.keys()].some((key) => key !== "variant")) return response({ error: "not_found" }, 404);
    let receiver: URL;
    try {
      receiver = new URL(env.RECEIVER_ORIGIN ?? "");
      // Only the dedicated probe hostname in the explicitly configured zone is permitted.
      if (receiver.protocol !== "https:" || receiver.origin !== env.RECEIVER_ORIGIN
        || !receiver.hostname.startsWith("proxy-probe-")
        || !receiver.hostname.endsWith(`.staging.dayli.${env.EXPECTED_ZONE}`)) throw new Error("invalid receiver");
    } catch { return response({ error: "invalid_diagnostic_target" }, 503); }
    try {
      const upstream = await fetch(new URL("/sample", receiver), {
        headers: probeHeaders(variant as Variant, env.PROBE_TOKEN),
        redirect: "manual",
        signal: AbortSignal.timeout(10000),
      });
      // Do not echo upstream error bodies or redirect destinations.
      if (upstream.status !== 200) return response({ variant, upstreamStatus: upstream.status }, 502);
      return response({ variant, observation: await upstream.json() });
    } catch { return response({ variant, error: "diagnostic_request_failed" }, 502); }
  },
};
