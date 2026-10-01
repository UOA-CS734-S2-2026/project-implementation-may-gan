import { forwardBrowserApiRequest } from "@/lib/api/server/browser-proxy";
import { browserApiTransport } from "@/lib/api/server/transport";
import { refreshAttemptCookie, safeReturnPath } from "@/lib/session/guards";
import { browserProxyEnabled } from "@/lib/api/config";

function sessionPayload(value: unknown): "authenticated" | "signed-out" | "invalid" {
  if (value === null) return "signed-out";
  if (!value || typeof value !== "object") return "invalid";
  const body = value as { user?: unknown; session?: unknown };
  return body.user && typeof body.user === "object" && body.session && typeof body.session === "object"
    ? "authenticated"
    : "invalid";
}

function noStore(status: number): Response {
  return Response.json({ error: { code: "SERVICE_UNAVAILABLE" } }, { status, headers: { "Cache-Control": "no-store" } });
}

/**
 * Browser-facing redirect endpoint for cookie mutations discovered by a server
 * component. It preserves API Set-Cookie headers on a real route response.
 */
export async function GET(request: Request): Promise<Response> {
  // The route is inert for direct API-cookie deployments, even if a binding exists.
  if (!browserProxyEnabled) return noStore(404);
  const returnTo = safeReturnPath(new URL(request.url).searchParams.get("returnTo"));
  let upstream: Response;
  try {
    upstream = await forwardBrowserApiRequest(new Request("https://web.invalid/api/auth/get-session?disableCookieCache=true", {
      headers: request.headers,
      cache: "no-store",
    }), await browserApiTransport());
  } catch {
    return noStore(503);
  }
  if (!upstream.ok) return noStore(upstream.status === 503 ? 503 : 502);
  const result = sessionPayload(await upstream.json().catch(() => undefined));
  if (result === "invalid") return noStore(502);

  const headers = new Headers(upstream.headers);
  headers.set("Cache-Control", "no-store");
  // The destination owns authorization. This keeps the public landing public
  // after an expired cookie is deleted, while protected guards redirect later.
  headers.set("Location", returnTo);
  // This value only bounds a possible refresh loop. It carries no identity or authorization meaning.
  headers.append("Set-Cookie", `${refreshAttemptCookie}=1; Max-Age=30; Path=/; HttpOnly; Secure; SameSite=Lax`);
  return new Response(null, { status: 303, headers });
}
