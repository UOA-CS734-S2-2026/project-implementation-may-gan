import { classifyFcmTransportFailure, type FcmTransportReason } from "./fcm";
import { diagnosticElapsed, safeException, type SafeException } from "./diagnostic-error";

export type OAuthEgressProof =
  | { outcome: "response_received"; httpStatus: number }
  | { outcome: "transport_failed"; transportReason: FcmTransportReason }
  | { outcome: "timed_out" | "response_invalid" };

const probes = [
  { id: "oauth_post_unbound", url: "https://oauth2.googleapis.com/token", method: "POST", bound: false, form: false, manual: false },
  { id: "oauth_post_bound", url: "https://oauth2.googleapis.com/token", method: "POST", bound: true, form: false, manual: false },
  { id: "oauth_form_unbound", url: "https://oauth2.googleapis.com/token", method: "POST", bound: false, form: true, manual: false },
  { id: "oauth_form_bound", url: "https://oauth2.googleapis.com/token", method: "POST", bound: true, form: true, manual: false },
  { id: "oauth_get_bound", url: "https://oauth2.googleapis.com/token", method: "GET", bound: true, form: false, manual: false },
  { id: "oauth_post_manual_redirect", url: "https://oauth2.googleapis.com/token", method: "POST", bound: true, form: false, manual: true },
  { id: "google_control", url: "https://www.google.com/generate_204", method: "GET", bound: true, form: false, manual: true },
  { id: "cloudflare_control", url: "https://www.cloudflare.com/robots.txt", method: "GET", bound: true, form: false, manual: true },
] as const;
export type EgressMatrixRow = OAuthEgressProof & {
  probe: typeof probes[number]["id"];
  elapsedMs: number;
  exception?: SafeException;
};

async function requestProof(fetcher: typeof fetch, url: string, init: RequestInit, onException?: (error: unknown) => void): Promise<OAuthEgressProof> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<OAuthEgressProof>((resolve) => {
    timer = setTimeout(() => { controller.abort(); resolve({ outcome: "timed_out" }); }, 5_000);
  });
  const request = (async (): Promise<OAuthEgressProof> => {
    try {
      const response = await fetcher(url, { ...init, signal: controller.signal });
      // Never inspect provider bodies or headers, even on redirects.
      void response.body?.cancel().catch(() => {});
      return Number.isInteger(response.status) && response.status >= 100 && response.status <= 599
        ? { outcome: "response_received", httpStatus: response.status }
        : { outcome: "response_invalid" };
    } catch (error) {
      if (!controller.signal.aborted) onException?.(error);
      return controller.signal.aborted ? { outcome: "timed_out" }
        : { outcome: "transport_failed", transportReason: classifyFcmTransportFailure(error) };
    }
  })();
  try { return await Promise.race([request, deadline]); }
  finally { clearTimeout(timer); }
}

function requireStaging(scope: unknown): void {
  if (scope !== "staging") throw new Error("OAuth egress diagnostics are staging-only.");
}

/** Legacy single probe, retained for existing private callers. */
export async function probeOAuthEgress(scope: unknown, fetcher: typeof fetch = globalThis.fetch): Promise<OAuthEgressProof> {
  requireStaging(scope);
  return requestProof(fetcher, "https://oauth2.googleapis.com/token", {
    method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
    body: "grant_type=diagnostic_invalid", redirect: "error",
  });
}

/** Eight fixed, credential-free controls run concurrently under five-second deadlines. */
export async function probeOAuthEgressMatrix(scope: unknown): Promise<EgressMatrixRow[]> {
  requireStaging(scope);
  const unbound = globalThis.fetch;
  const bound: typeof fetch = (url, init) => globalThis.fetch(url, init);
  return Promise.all(probes.map(async (probe): Promise<EgressMatrixRow> => {
    const started = Date.now();
    let exception: SafeException | undefined;
    const post = probe.method === "POST";
    const proof = await requestProof(probe.bound ? bound : unbound, probe.url, {
      method: probe.method,
      redirect: probe.manual ? "manual" : "error",
      ...(post ? {
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: probe.form ? new URLSearchParams({ grant_type: "diagnostic_invalid" }) : "grant_type=diagnostic_invalid",
      } : {}),
    }, (error) => { exception = safeException(error); });
    return { probe: probe.id, ...proof, elapsedMs: diagnosticElapsed(started), ...(exception ? { exception } : {}) };
  }));
}
