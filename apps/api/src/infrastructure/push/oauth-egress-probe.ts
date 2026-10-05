import { classifyFcmTransportFailure, type FcmTransportReason } from "./fcm";

export type OAuthEgressProof =
  | { outcome: "response_received"; httpStatus: number }
  | { outcome: "transport_failed"; transportReason: FcmTransportReason }
  | { outcome: "timed_out" | "response_invalid" };

/** Fixed destination and invalid grant. No credentials, tokens or bodies enter the result. */
export async function probeOAuthEgress(scope: unknown, fetcher: typeof fetch = globalThis.fetch): Promise<OAuthEgressProof> {
  if (scope !== "staging") throw new Error("OAuth egress diagnostics are staging-only.");
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<OAuthEgressProof>((resolve) => {
    timer = setTimeout(() => { controller.abort(); resolve({ outcome: "timed_out" }); }, 5_000);
  });
  const request = (async (): Promise<OAuthEgressProof> => {
    try {
      const response = await fetcher("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: "grant_type=diagnostic_invalid",
        redirect: "error",
        signal: controller.signal,
      });
      // Do not read or return provider bodies. Cancel without delaying the result.
      void response.body?.cancel().catch(() => {});
      return Number.isInteger(response.status) && response.status >= 100 && response.status <= 599
        ? { outcome: "response_received", httpStatus: response.status }
        : { outcome: "response_invalid" };
    } catch (error) {
      return controller.signal.aborted ? { outcome: "timed_out" }
        : { outcome: "transport_failed", transportReason: classifyFcmTransportFailure(error) };
    }
  })();
  try { return await Promise.race([request, deadline]); }
  finally { clearTimeout(timer); }
}
