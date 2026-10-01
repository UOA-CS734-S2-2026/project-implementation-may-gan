import { createRoute, type OpenAPIHono } from "@hono/zod-openapi";
import { apiErrorSchema } from "@dayli/contracts";
import { apiErrorResponse } from "../../../http/api-error";
import type { AuthenticatedApiEnv } from "../../../http/authenticated-actor";
import { createRequireSession, type ResolveSession } from "../../../http/middleware/require-session";
import type { ActorRateLimiter } from "../../../http/middleware/rate-limit";
import { rateLimitErrorResponse } from "../../../http/rate-limit-contract";
import { profileDetailsSchema } from "../shared/profile-details.contract";
import { setAvatarRequestSchema } from "./set-avatar.contract";
import type { SetAvatarRepository } from "./set-avatar.repository";

export interface SetAvatarRouteDependencies {
  /** Resolves the Better Auth cookie or bearer session; never trusts a request-supplied user. */
  resolveSession: ResolveSession;
  repository?: SetAvatarRepository;
  now?: () => Date;
  rateLimiter?: ActorRateLimiter;
}

const security: Array<Record<string, string[]>> = [{ BearerAuth: [] }, { cookieAuth: [] }];
const path = "/api/v1/profile/avatar";
const error = (description: string) => ({ description, content: { "application/json": { schema: apiErrorSchema } } });

const setAvatarRoute = createRoute({
  method: "put",
  path,
  tags: ["Profile"],
  operationId: "profile.setAvatar",
  summary: "Set your profile photo",
  description: "Uses one of your validated JPEG, PNG, or WebP uploads as your profile photo, replacing any previous one. Upload it first through the media reservation flow.",
  security,
  request: { body: { required: true, content: { "application/json": { schema: setAvatarRequestSchema } } } },
  responses: {
    200: { description: "The profile with its new photo, as its owner sees it.", content: { "application/json": { schema: profileDetailsSchema } } },
    401: error("Authentication is required."),
    404: error("The upload does not exist or is not yours. The cases are indistinguishable."),
    409: error("The upload has not been validated (`details.reason = \"notReady\"`), is not a JPEG, PNG, or WebP image (`\"notImage\"`), or the account has no username yet (`\"needsUsername\"`)."),
    422: error("The request contains invalid values."),
    429: rateLimitErrorResponse,
    503: error("Profile storage is temporarily unavailable."),
  },
});

export function registerSetAvatarRoute(app: OpenAPIHono<AuthenticatedApiEnv>, dependencies: SetAvatarRouteDependencies) {
  app.on("PUT", path, createRequireSession(dependencies.resolveSession, dependencies.rateLimiter));
  app.openapi(setAvatarRoute, async (context) => {
    context.header("Cache-Control", "no-store");
    if (!dependencies.repository) {
      return apiErrorResponse(context, 503, "SERVICE_UNAVAILABLE", "Profile storage is temporarily unavailable.");
    }
    const now = dependencies.now?.() ?? new Date();
    try {
      const outcome = await dependencies.repository.setAvatar(context.get("actor").userId, context.req.valid("json").reservationId, now);
      switch (outcome.kind) {
        case "set":
          return context.json(outcome.profile, 200);
        case "notFound":
          return apiErrorResponse(context, 404, "NOT_FOUND", "The upload was not found.");
        case "notReady":
          return apiErrorResponse(context, 409, "CONFLICT", "That upload hasn't finished checking yet.", { reason: "notReady" });
        case "notImage":
          return apiErrorResponse(context, 409, "CONFLICT", "Choose a JPEG, PNG, or WebP photo.", { reason: "notImage" });
        case "needsUsername":
          return apiErrorResponse(context, 409, "CONFLICT", "Choose a username first.", { reason: "needsUsername" });
      }
    } catch (error) {
      console.error("dayli avatar update failed", error instanceof Error ? error.name : "unknown");
      return apiErrorResponse(context, 503, "SERVICE_UNAVAILABLE", "Profile storage is temporarily unavailable.");
    }
  });
}
