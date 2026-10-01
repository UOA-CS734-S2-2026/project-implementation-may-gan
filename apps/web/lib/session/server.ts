import "server-only";

import { headers } from "next/headers";
import { forwardBrowserApiRequest, type ApiTransport } from "@/lib/api/server/browser-proxy";
import { browserApiTransport } from "@/lib/api/server/transport";

export type ServerSession = { user: Record<string, unknown>; session: Record<string, unknown> };
export type ServerSessionResult =
  | { state: "authenticated"; value: ServerSession }
  | { state: "signed-out" }
  | { state: "cookie-mutation-required" }
  | { state: "unavailable" };

function hasSetCookie(response: Response): boolean {
  const headerList = response.headers as Headers & { getSetCookie?: () => string[] };
  return Boolean(headerList.getSetCookie?.().length ?? response.headers.get("set-cookie"));
}

function isServerSession(value: unknown): value is ServerSession {
  if (!value || typeof value !== "object") return false;
  const result = value as { user?: unknown; session?: unknown };
  return Boolean(result.user && typeof result.user === "object" && result.session && typeof result.session === "object");
}

/**
 * Resolves a session through the same private browser proxy as client auth.
 * React Server Components cannot apply Set-Cookie. A refresh or clearing
 * cookie therefore becomes an explicit result, never a silently lost update.
 */
export async function resolveServerSession(
  incomingHeaders: Headers,
  transport: ApiTransport | undefined,
): Promise<ServerSessionResult> {
  const requestHeaders = new Headers();
  for (const name of ["cookie", "cf-connecting-ip", "cf-worker"]) {
    const value = incomingHeaders.get(name);
    if (value !== null) requestHeaders.set(name, value);
  }
  const request = new Request("https://server-session.invalid/api/auth/get-session?disableCookieCache=true", {
    headers: requestHeaders,
    cache: "no-store",
  });
  let response: Response;
  try {
    response = await forwardBrowserApiRequest(request, transport);
  } catch {
    return { state: "unavailable" };
  }
  if (hasSetCookie(response)) return { state: "cookie-mutation-required" };
  if (response.status === 401) return { state: "signed-out" };
  if (!response.ok) return { state: "unavailable" };
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return { state: "unavailable" };
  }
  if (body === null) return { state: "signed-out" };
  return isServerSession(body) ? { state: "authenticated", value: body } : { state: "unavailable" };
}

/** Next.js server-component convenience wrapper. It does not redirect or set cookies. */
export async function getServerSession(): Promise<ServerSessionResult> {
  return resolveServerSession(await headers(), await browserApiTransport());
}
