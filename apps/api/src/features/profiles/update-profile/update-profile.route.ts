import { createRoute, type OpenAPIHono } from "@hono/zod-openapi";
import { apiErrorSchema } from "@dayli/contracts";
import { apiErrorResponse } from "../../../http/api-error";
import type { AuthenticatedApiEnv } from "../../../http/authenticated-actor";
import { createRequireSession, type ResolveSession } from "../../../http/middleware/require-session";
import type { ActorRateLimiter } from "../../../http/middleware/rate-limit";
import { rateLimitErrorResponse } from "../../../http/rate-limit-contract";
import { profileDetailsSchema } from "../shared/profile-details.contract";
import { updateProfileRequestSchema } from "./update-profile.contract";
import type { UpdateProfileRepository } from "./update-profile.repository";

export interface UpdateProfileRouteDependencies {
  /** Resolves the Better Auth cookie or bearer session; never trusts a request-supplied user. */
  resolveSession: ResolveSession;
  repository?: UpdateProfileRepository;
  now?: () => Date;
  rateLimiter?: ActorRateLimiter;
}

const security: Array<Record<string, string[]>> = [{ BearerAuth: [] }, { cookieAuth: [] }];
const path = "/api/v1/profile";
const error = (description: string) => ({ description, content: { "application/json": { schema: apiErrorSchema } } });

const updateProfileRoute = createRoute({
  method: "patch",
  path,
  tags: ["Profile"],
  operationId: "profile.update",
  summary: "Update your profile",
  description: "Changes any of the bio, public name, profile visibility, MBTI, what you do, and what you are listening to for the authenticated account. Fields left out are unchanged; null or blank text clears a field.",
  security,
  request: { body: { required: true, content: { "application/json": { schema: updateProfileRequestSchema } } } },
  responses: {
    200: { description: "The updated profile, as its owner sees it.", content: { "application/json": { schema: profileDetailsSchema } } },
    401: error("Authentication is required."),
    409: error("The account has not chosen a username yet."),
    422: error("The request contains invalid values."),
    429: rateLimitErrorResponse,
    503: error("Profile storage is temporarily unavailable."),
  },
});

export function registerUpdateProfileRoute(app: OpenAPIHono<AuthenticatedApiEnv>, dependencies: UpdateProfileRouteDependencies) {
  app.use(path, createRequireSession(dependencies.resolveSession, dependencies.rateLimiter));
  app.openapi(updateProfileRoute, async (context) => {
    context.header("Cache-Control", "no-store");
    if (!dependencies.repository) {
      return apiErrorResponse(context, 503, "SERVICE_UNAVAILABLE", "Profile storage is temporarily unavailable.");
    }
    const now = dependencies.now?.() ?? new Date();
    try {
      const outcome = await dependencies.repository.updateProfile(context.get("actor").userId, context.req.valid("json"), now);
      if (outcome.kind === "missing") return apiErrorResponse(context, 401, "UNAUTHENTICATED", "Authentication is required.");
      if (outcome.kind === "needsUsername") return apiErrorResponse(context, 409, "CONFLICT", "Choose a username first.");
      return context.json(outcome.profile, 200);
    } catch (error) {
      console.error("dayli profile update failed", error instanceof Error ? error.name : "unknown");
      return apiErrorResponse(context, 503, "SERVICE_UNAVAILABLE", "Profile storage is temporarily unavailable.");
    }
  });
}
