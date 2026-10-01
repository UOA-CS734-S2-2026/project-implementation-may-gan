import { createRoute, z, type OpenAPIHono } from "@hono/zod-openapi";
import { apiErrorSchema } from "@dayli/contracts";
import { apiErrorResponse } from "../../../http/api-error";
import type { AuthenticatedApiEnv } from "../../../http/authenticated-actor";
import { createRequireSession, type ResolveSession } from "../../../http/middleware/require-session";
import type { ActorRateLimiter } from "../../../http/middleware/rate-limit";
import { rateLimitErrorResponse } from "../../../http/rate-limit-contract";
import { profileDetailsSchema } from "../shared/profile-details.contract";
import type { ProfileDetailsRepository } from "./get-profile-details.repository";

export interface GetProfileDetailsRouteDependencies {
  /** Resolves the Better Auth cookie or bearer session; never trusts a request-supplied user. */
  resolveSession: ResolveSession;
  repository?: ProfileDetailsRepository;
  now?: () => Date;
  rateLimiter?: ActorRateLimiter;
}

const security: Array<Record<string, string[]>> = [{ BearerAuth: [] }, { cookieAuth: [] }];

const paramsSchema = z.object({
  username: z.string().trim().min(2).max(32).regex(/^[a-zA-Z0-9_]+$/)
    .openapi({ param: { name: "username", in: "path" }, example: "ben" }),
});

const error = (description: string) => ({ description, content: { "application/json": { schema: apiErrorSchema } } });

const getProfileDetailsRoute = createRoute({
  method: "get",
  path: "/api/v1/profiles/{username}",
  tags: ["Profile"],
  operationId: "profile.getDetails",
  summary: "Read a profile's details",
  description: "Returns the public name and, when the caller may see it, the bio. The owner always sees their bio; anyone else sees it when the account is public or when they are active friends. The owner also gets their visibility and when their username can next change. A handle the owner gave up in the last 30 days resolves to their current profile. Unknown, banned and blocked profiles all return 404.",
  security,
  request: { params: paramsSchema },
  responses: {
    200: { description: "The profile.", content: { "application/json": { schema: profileDetailsSchema } } },
    401: error("Authentication is required."),
    404: error("The profile does not exist or is blocked in either direction. The cases are indistinguishable."),
    422: error("The username is invalid."),
    429: rateLimitErrorResponse,
    503: error("Profile storage is temporarily unavailable."),
  },
});

export function registerGetProfileDetailsRoute(app: OpenAPIHono<AuthenticatedApiEnv>, dependencies: GetProfileDetailsRouteDependencies) {
  app.use("/api/v1/profiles/:username", createRequireSession(dependencies.resolveSession, dependencies.rateLimiter));
  app.openapi(getProfileDetailsRoute, async (context) => {
    context.header("Cache-Control", "no-store");
    if (!dependencies.repository) {
      return apiErrorResponse(context, 503, "SERVICE_UNAVAILABLE", "Profile storage is temporarily unavailable.");
    }
    const now = dependencies.now?.() ?? new Date();
    try {
      const profile = await dependencies.repository.findProfile(context.get("actor").userId, context.req.valid("param").username, now);
      if (!profile) return apiErrorResponse(context, 404, "NOT_FOUND", "The profile was not found.");
      return context.json(profile, 200);
    } catch (error) {
      console.error("dayli profile read failed", error instanceof Error ? error.name : "unknown");
      return apiErrorResponse(context, 503, "SERVICE_UNAVAILABLE", "Profile storage is temporarily unavailable.");
    }
  });
}
