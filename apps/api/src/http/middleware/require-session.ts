import type { MiddlewareHandler } from "hono";
import { apiErrorResponse } from "../api-error";
import type { AuthenticatedActor, AuthenticatedApiEnv } from "../authenticated-actor";
import { rateLimitedResponse, unavailableResponse, type ActorRateLimiter } from "./rate-limit";

/** Resolves a Better Auth cookie or bearer credential to a server-verified actor. */
export type ResolveSession = (request: Request) => Promise<AuthenticatedActor | null | undefined>;

/**
 * Build protected-route middleware without constructing Better Auth during app or
 * OpenAPI generation. Missing or invalid credentials are 401, resolver outages
 * are 503. Both responses are private.
 */
export function createRequireSession(
  resolveSession: ResolveSession,
  rateLimiter?: ActorRateLimiter,
): MiddlewareHandler<AuthenticatedApiEnv> {
  return async (context, next) => {
    context.header("Cache-Control", "no-store");

    let actor: AuthenticatedActor | null | undefined;
    try {
      actor = await resolveSession(context.req.raw);
    } catch {
      return apiErrorResponse(
        context,
        503,
        "SERVICE_UNAVAILABLE",
        "Authentication is temporarily unavailable.",
      );
    }

    if (!actor || actor.userId.length === 0) {
      return apiErrorResponse(context, 401, "UNAUTHENTICATED", "Authentication is required.");
    }

    context.set("actor", actor);
    if (rateLimiter) {
      const decision = await rateLimiter.check(context.req.raw, actor);
      if (decision === "denied") return rateLimitedResponse(context);
      if (decision === "unavailable") return unavailableResponse(context);
    }
    await next();
  };
}
