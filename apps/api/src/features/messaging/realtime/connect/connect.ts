import { diagnosticElapsed, safeException, type SafeException } from "../../../../infrastructure/push/diagnostic-error";
import { usernameSetupStatus, type HasUsername } from "../../../../http/middleware/require-username";
import { rateLimitedFetchResponse, unavailableFetchResponse, type ActorRateLimiter } from "../../../../http/middleware/rate-limit";
import type { VerifiedRealtimeSession } from "../shared/realtime-types";

export type RealtimeConnectOutcome = "upgrade_missing" | "ticket_missing" | "origin_denied" | "ticket_invalid" | "session_invalid" | "policy_denied" | "policy_unavailable" | "rate_denied" | "rate_unavailable" | "username_missing" | "username_unavailable" | "upgrade_returned" | "dependency_failed";
export interface RealtimeConnectDependencies {
  onDiagnostic?: (value: { outcome: RealtimeConnectOutcome; elapsedMs: number; httpStatus?: number; exception?: SafeException }) => void;
  tickets: { consume(ticket: string): Promise<{ userId: string; sessionId: string; expiresAt: Date; sessionExpiresAt: Date } | null> };
  /** Fresh lookup prevents a revoked session from upgrading with an old ticket. */
  resolveActiveSession(sessionId: string): Promise<VerifiedRealtimeSession | null>;
  userRealtime: DurableObjectNamespace;
  trustedOrigins: readonly string[];
  hasUsername?: HasUsername;
  /** Fresh policy check after ticket consumption and before the upgrade. */
  policyAllowsOrdinary(userId: string): Promise<boolean>;
  rateLimiter?: ActorRateLimiter;
}

/**
 * Consumes the ticket before forwarding the upgrade to the user's private DO.
 * Ticket text is never logged or copied to the DO attachment.
 */
export async function connectRealtime(request: Request, dependencies: RealtimeConnectDependencies): Promise<Response> {
  const started = Date.now();
  const diagnose = (outcome: RealtimeConnectOutcome, httpStatus?: number, error?: unknown) => {
    try { dependencies.onDiagnostic?.({ outcome, elapsedMs: diagnosticElapsed(started), ...(httpStatus === undefined ? {} : { httpStatus }), ...(error === undefined ? {} : { exception: safeException(error) }) }); }
    catch { /* Ignore diagnostic sink failures. */ }
  };
  const reject = (outcome: RealtimeConnectOutcome, response: Response) => { diagnose(outcome, response.status); return response; };
  if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") return reject("upgrade_missing", new Response("WebSocket upgrade required.", { status: 426 }));
  const url = new URL(request.url);
  const ticket = url.searchParams.get("ticket");
  if (!ticket) return reject("ticket_missing", new Response("Unauthorized.", { status: 401, headers: { "Cache-Control": "no-store" } }));
  const origin = request.headers.get("Origin");
  if (origin && !dependencies.trustedOrigins.includes(origin)) return reject("origin_denied", new Response("Forbidden.", { status: 403, headers: { "Cache-Control": "no-store" } }));

  const checked = async <T>(operation: () => Promise<T>) => {
    try { return await operation(); }
    catch (error) { diagnose("dependency_failed", undefined, error); throw error; }
  };
  const consumed = await checked(() => dependencies.tickets.consume(ticket));
  if (!consumed) return reject("ticket_invalid", new Response("Unauthorized.", { status: 401, headers: { "Cache-Control": "no-store" } }));
  const session = await checked(() => dependencies.resolveActiveSession(consumed.sessionId));
  if (!session || session.userId !== consumed.userId || session.expiresAt.getTime() <= Date.now()) {
    return reject("session_invalid", new Response("Unauthorized.", { status: 401, headers: { "Cache-Control": "no-store" } }));
  }
  try {
    if (!await dependencies.policyAllowsOrdinary(session.userId)) {
      return reject("policy_denied", new Response("Forbidden.", { status: 403, headers: { "Cache-Control": "no-store" } }));
    }
  } catch (error) {
    diagnose("policy_unavailable", 503, error);
    return new Response("Account policy is temporarily unavailable.", { status: 503, headers: { "Cache-Control": "no-store" } });
  }
  if (dependencies.rateLimiter) {
    const decision = await dependencies.rateLimiter.check(request, { userId: session.userId });
    if (decision === "denied") return reject("rate_denied", rateLimitedFetchResponse());
    if (decision === "unavailable") return reject("rate_unavailable", unavailableFetchResponse());
  }
  const usernameStatus = await usernameSetupStatus(dependencies.hasUsername, session.userId);
  if (usernameStatus === "unavailable") return reject("username_unavailable", new Response("Username setup is temporarily unavailable.", { status: 503, headers: { "Cache-Control": "no-store" } }));
  if (usernameStatus === "missing") return reject("username_missing", new Response("Choose a username before using messaging.", { status: 403, headers: { "Cache-Control": "no-store" } }));

  const headers = new Headers(request.headers);
  headers.delete("x-dayli-realtime-session");
  headers.set("x-dayli-realtime-session", JSON.stringify({ userId: session.userId, sessionId: session.sessionId, expiresAt: session.expiresAt.toISOString(), version: 1 }));
  // A DO binding is private to this Worker. No public HTTP route forwards this header.
  const response = await checked(() => dependencies.userRealtime.get(dependencies.userRealtime.idFromName(session.userId)).fetch(new Request("https://user-realtime.internal/connect", { headers })));
  diagnose("upgrade_returned", response.status);
  return response;
}
