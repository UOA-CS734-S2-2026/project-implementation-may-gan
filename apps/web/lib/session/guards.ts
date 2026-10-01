import "server-only";

import { forwardBrowserApiRequest, type ApiTransport } from "@/lib/api/server/browser-proxy";
import { resolveServerSession, type ServerSession, type ServerSessionResult } from "./server";
import { safeReturnPath } from "@/lib/routing/safe-return-path";

export type SessionGuard =
  | { state: "allowed"; session: ServerSession }
  | { state: "redirect"; location: string }
  | { state: "unavailable" };
export type UsernameGuard =
  | { state: "ready"; session: ServerSession }
  | { state: "needs-username" }
  | Exclude<SessionGuard, { state: "allowed" }>;
export type LandingGuard = { state: "render" } | { state: "redirect"; location: string };

const refreshAttemptCookie = "dayli_session_refresh_attempt";

export function hasSessionRefreshAttempt(headers: Headers): boolean {
  return headers.get("cookie")?.split(";").some((part) => part.trim() === `${refreshAttemptCookie}=1`) ?? false;
}

export function sessionGuard(result: ServerSessionResult, returnTo: string, refreshAttempted: boolean): SessionGuard {
  const destination = safeReturnPath(returnTo);
  if (result.state === "authenticated") return { state: "allowed", session: result.value };
  if (result.state === "signed-out") return { state: "redirect", location: `/sign-in?next=${encodeURIComponent(destination)}` };
  if (result.state === "cookie-mutation-required") {
    if (refreshAttempted) return { state: "unavailable" };
    return { state: "redirect", location: `/auth/session-refresh?returnTo=${encodeURIComponent(destination)}` };
  }
  return { state: "unavailable" };
}

function browserRequest(headers: Headers, path: string): Request {
  const forwarded = new Headers();
  for (const name of ["cookie", "cf-connecting-ip", "cf-worker"]) {
    const value = headers.get(name);
    if (value !== null) forwarded.set(name, value);
  }
  return new Request(`https://server-session.invalid${path}`, { headers: forwarded, cache: "no-store" });
}

export async function requireSession(
  headers: Headers,
  transport: ApiTransport | undefined,
  returnTo: string,
): Promise<SessionGuard> {
  return sessionGuard(await resolveServerSession(headers, transport), returnTo, hasSessionRefreshAttempt(headers));
}

async function readUsernameReadiness(headers: Headers, transport: ApiTransport | undefined): Promise<"ready" | "needs-username" | "unavailable"> {
  let response: Response;
  try {
    response = await forwardBrowserApiRequest(browserRequest(headers, "/api/v1/profile/username"), transport);
  } catch {
    return "unavailable";
  }
  if (!response.ok || response.headers.has("set-cookie")) return "unavailable";
  const profile = await response.json().catch(() => null) as { needsUsernameSetup?: unknown } | null;
  if (!profile || typeof profile.needsUsernameSetup !== "boolean") return "unavailable";
  return profile.needsUsernameSetup ? "needs-username" : "ready";
}

export async function requireUsernameReady(
  headers: Headers,
  transport: ApiTransport | undefined,
  returnTo: string,
): Promise<UsernameGuard> {
  const session = await requireSession(headers, transport, returnTo);
  if (session.state !== "allowed") return session;
  const readiness = await readUsernameReadiness(headers, transport);
  if (readiness === "unavailable") return { state: "unavailable" };
  return readiness === "needs-username" ? { state: "needs-username" } : { state: "ready", session: session.session };
}

/** Public landing remains visible to signed-out and unavailable visitors. */
export async function resolveLanding(
  headers: Headers,
  transport: ApiTransport | undefined,
): Promise<LandingGuard> {
  const session = await resolveServerSession(headers, transport);
  if (session.state === "signed-out" || session.state === "unavailable") return { state: "render" };
  if (session.state === "cookie-mutation-required") {
    const decision = sessionGuard(session, "/", hasSessionRefreshAttempt(headers));
    return decision.state === "redirect" ? decision : { state: "render" };
  }
  const readiness = await readUsernameReadiness(headers, transport);
  if (readiness === "ready") return { state: "redirect", location: "/home" };
  if (readiness === "needs-username") return { state: "redirect", location: "/setup-username" };
  return { state: "render" };
}

export { refreshAttemptCookie, safeReturnPath };
