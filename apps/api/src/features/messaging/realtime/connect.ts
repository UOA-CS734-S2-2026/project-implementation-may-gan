import { usernameSetupStatus, type HasUsername } from "../../../http/middleware/require-username";
import type { VerifiedRealtimeSession } from "./ticket.service";

export interface RealtimeConnectDependencies {
  tickets: { consume(ticket: string): Promise<{ userId: string; sessionId: string; expiresAt: Date; sessionExpiresAt: Date } | null> };
  /** Fresh lookup prevents a revoked session from upgrading with an old ticket. */
  resolveActiveSession(sessionId: string): Promise<VerifiedRealtimeSession | null>;
  userRealtime: DurableObjectNamespace;
  trustedOrigins: readonly string[];
  hasUsername?: HasUsername;
}

/**
 * Consumes the ticket before forwarding the upgrade to the user's private DO.
 * Ticket text is never logged or copied to the DO attachment.
 */
export async function connectRealtime(request: Request, dependencies: RealtimeConnectDependencies): Promise<Response> {
  if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") return new Response("WebSocket upgrade required.", { status: 426 });
  const url = new URL(request.url);
  const ticket = url.searchParams.get("ticket");
  if (!ticket) return new Response("Unauthorized.", { status: 401, headers: { "Cache-Control": "no-store" } });
  const origin = request.headers.get("Origin");
  if (origin && !dependencies.trustedOrigins.includes(origin)) return new Response("Forbidden.", { status: 403, headers: { "Cache-Control": "no-store" } });

  const consumed = await dependencies.tickets.consume(ticket);
  if (!consumed) return new Response("Unauthorized.", { status: 401, headers: { "Cache-Control": "no-store" } });
  const session = await dependencies.resolveActiveSession(consumed.sessionId);
  if (!session || session.userId !== consumed.userId || session.expiresAt.getTime() <= Date.now()) {
    return new Response("Unauthorized.", { status: 401, headers: { "Cache-Control": "no-store" } });
  }
  const usernameStatus = await usernameSetupStatus(dependencies.hasUsername, session.userId);
  if (usernameStatus === "unavailable") return new Response("Username setup is temporarily unavailable.", { status: 503, headers: { "Cache-Control": "no-store" } });
  if (usernameStatus === "missing") return new Response("Choose a username before using messaging.", { status: 403, headers: { "Cache-Control": "no-store" } });

  const headers = new Headers(request.headers);
  headers.delete("x-dayli-realtime-session");
  headers.set("x-dayli-realtime-session", JSON.stringify({ userId: session.userId, sessionId: session.sessionId, expiresAt: session.expiresAt.toISOString(), version: 1 }));
  // A DO binding is private to this Worker. No public HTTP route forwards this header.
  return dependencies.userRealtime.get(dependencies.userRealtime.idFromName(session.userId)).fetch(new Request("https://user-realtime.internal/connect", { headers }));
}
