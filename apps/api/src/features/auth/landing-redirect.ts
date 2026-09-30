import type { OpenAPIHono } from "@hono/zod-openapi";
import type { Env } from "hono";
import type { ResolveSession } from "../../http/middleware/require-session";
import type { UsernameProfileStore } from "../profiles/username/username.repository";

const path = "/api/auth/landing";

type LandingDestination = "signed-out" | "home" | "setup-username";

export interface LandingRedirectDependencies {
  resolveSession: ResolveSession;
  store?: UsernameProfileStore;
  webOrigin?: string;
}

function responseHeaders() {
  return {
    "cache-control": "no-store, private",
    "referrer-policy": "no-referrer",
    vary: "Cookie",
  };
}

function resolveWebOrigin(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.origin === value && url.pathname === "/" && !url.search && !url.hash
      ? url.origin
      : undefined;
  } catch {
    return undefined;
  }
}

function destinationUrl(webOrigin: string, destination: LandingDestination) {
  const path = destination === "home"
    ? "/home"
    : destination === "setup-username"
      ? "/setup-username"
      : "/?landing=signed-out";
  return new URL(path, webOrigin).toString();
}

function unavailable() {
  return new Response(null, { status: 503, headers: responseHeaders() });
}

/**
 * Resolves the API-origin session before the web Worker renders the public
 * landing page. The API session cookie stays host-only and never crosses to
 * the web origin.
 */
export function registerLandingRedirectRoute<E extends Env>(app: OpenAPIHono<E>, dependencies: LandingRedirectDependencies) {
  app.get(path, async (context) => {
    const webOrigin = resolveWebOrigin(dependencies.webOrigin);
    if (!webOrigin || !dependencies.store) return unavailable();

    let destination: LandingDestination = "signed-out";
    try {
      const actor = await dependencies.resolveSession(context.req.raw);
      if (actor) {
        const profile = await dependencies.store.get(actor.userId);
        destination = profile?.needsUsernameSetup ? "setup-username" : profile ? "home" : "signed-out";
      }
    } catch {
      return unavailable();
    }

    return new Response(null, {
      status: 302,
      headers: { ...responseHeaders(), location: destinationUrl(webOrigin, destination) },
    });
  });
}
