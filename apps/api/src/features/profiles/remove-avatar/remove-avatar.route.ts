import { createRoute, type OpenAPIHono } from "@hono/zod-openapi";
import { apiErrorSchema } from "@dayli/contracts";
import { apiErrorResponse } from "../../../http/api-error";
import type { AuthenticatedApiEnv } from "../../../http/authenticated-actor";
import { createRequireSession, type ResolveSession } from "../../../http/middleware/require-session";
import type { ActorRateLimiter } from "../../../http/middleware/rate-limit";
import { rateLimitErrorResponse } from "../../../http/rate-limit-contract";
import { profileDetailsSchema } from "../shared/profile-details.contract";
import type { RemoveAvatarRepository } from "./remove-avatar.repository";

export interface RemoveAvatarRouteDependencies {
  /** Resolves the Better Auth cookie or bearer session; never trusts a request-supplied user. */
  resolveSession: ResolveSession;
  repository?: RemoveAvatarRepository;
  now?: () => Date;
  rateLimiter?: ActorRateLimiter;
}

const security: Array<Record<string, string[]>> = [{ BearerAuth: [] }, { cookieAuth: [] }];
const path = "/api/v1/profile/avatar";
const error = (description: string) => ({ description, content: { "application/json": { schema: apiErrorSchema } } });

const removeAvatarRoute = createRoute({
  method: "delete",
  path,
  tags: ["Profile"],
  operationId: "profile.removeAvatar",
  summary: "Remove your profile photo",
  description: "Removes the profile photo. Profiles then show the first letter of the name.",
  security,
  responses: {
    200: { description: "The profile without a photo, as its owner sees it.", content: { "application/json": { schema: profileDetailsSchema } } },
    401: error("Authentication is required."),
    409: error("The account has not chosen a username yet."),
    429: rateLimitErrorResponse,
    503: error("Profile storage is temporarily unavailable."),
  },
});

export function registerRemoveAvatarRoute(app: OpenAPIHono<AuthenticatedApiEnv>, dependencies: RemoveAvatarRouteDependencies) {
  app.on("DELETE", path, createRequireSession(dependencies.resolveSession, dependencies.rateLimiter));
  app.openapi(removeAvatarRoute, async (context) => {
    context.header("Cache-Control", "no-store");
    if (!dependencies.repository) {
      return apiErrorResponse(context, 503, "SERVICE_UNAVAILABLE", "Profile storage is temporarily unavailable.");
    }
    const now = dependencies.now?.() ?? new Date();
    try {
      const outcome = await dependencies.repository.removeAvatar(context.get("actor").userId, now);
      if (outcome.kind === "missing") return apiErrorResponse(context, 401, "UNAUTHENTICATED", "Authentication is required.");
      if (outcome.kind === "needsUsername") return apiErrorResponse(context, 409, "CONFLICT", "Choose a username first.");
      return context.json(outcome.profile, 200);
    } catch (error) {
      console.error("dayli avatar removal failed", error instanceof Error ? error.name : "unknown");
      return apiErrorResponse(context, 503, "SERVICE_UNAVAILABLE", "Profile storage is temporarily unavailable.");
    }
  });
}
