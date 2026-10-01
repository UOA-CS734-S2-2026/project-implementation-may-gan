import { createRoute, type OpenAPIHono } from "@hono/zod-openapi";
import { apiErrorSchema } from "@dayli/contracts";
import { apiErrorResponse } from "../../../http/api-error";
import type { AuthenticatedApiEnv } from "../../../http/authenticated-actor";
import { createRequireSession, type ResolveSession } from "../../../http/middleware/require-session";
import type { ActorRateLimiter } from "../../../http/middleware/rate-limit";
import { rateLimitErrorResponse } from "../../../http/rate-limit-contract";
import { changeUsernameRequestSchema, changeUsernameResponseSchema } from "./change-username.contract";
import type { ChangeUsernameRepository } from "./change-username.repository";

export interface ChangeUsernameRouteDependencies {
  /** Resolves the Better Auth cookie or bearer session; never trusts a request-supplied user. */
  resolveSession: ResolveSession;
  repository?: ChangeUsernameRepository;
  now?: () => Date;
  rateLimiter?: ActorRateLimiter;
}

const security: Array<Record<string, string[]>> = [{ BearerAuth: [] }, { cookieAuth: [] }];
const path = "/api/v1/profile/username";
const error = (description: string) => ({ description, content: { "application/json": { schema: apiErrorSchema } } });

const changeUsernameRoute = createRoute({
  method: "put",
  path,
  tags: ["Profile"],
  operationId: "profile.changeUsername",
  summary: "Change your username",
  description: "Changes an established username. It can change at most once every 30 days. The previous handle stays reserved for this account for 30 days, and profile links to it resolve to the new one. Choosing the current handle again changes nothing.",
  security,
  request: { body: { required: true, content: { "application/json": { schema: changeUsernameRequestSchema } } } },
  responses: {
    200: { description: "The current username.", content: { "application/json": { schema: changeUsernameResponseSchema } } },
    401: error("Authentication is required."),
    409: error("The username is taken or reserved (`details.reason = \"taken\"`), the last change was under 30 days ago (`details.reason = \"tooSoon\"` with `details.availableAt`), or the account has not chosen a username yet (`details.reason = \"needsUsername\"`)."),
    422: error("The username is invalid."),
    429: rateLimitErrorResponse,
    503: error("Profile storage is temporarily unavailable."),
  },
});

export function registerChangeUsernameRoute(app: OpenAPIHono<AuthenticatedApiEnv>, dependencies: ChangeUsernameRouteDependencies) {
  app.on("PUT", path, createRequireSession(dependencies.resolveSession, dependencies.rateLimiter));
  app.openapi(changeUsernameRoute, async (context) => {
    context.header("Cache-Control", "no-store");
    if (!dependencies.repository) {
      return apiErrorResponse(context, 503, "SERVICE_UNAVAILABLE", "Profile storage is temporarily unavailable.");
    }
    const now = dependencies.now?.() ?? new Date();
    try {
      const outcome = await dependencies.repository.changeUsername(context.get("actor").userId, context.req.valid("json").username, now);
      switch (outcome.kind) {
        case "changed":
        case "unchanged":
          return context.json({ username: outcome.username, usernameChangeAvailableAt: outcome.availableAt?.toISOString() ?? null }, 200);
        case "tooSoon":
          return apiErrorResponse(context, 409, "CONFLICT", "You can change your username once every 30 days.", { reason: "tooSoon", availableAt: outcome.availableAt.toISOString() });
        case "taken":
          return apiErrorResponse(context, 409, "CONFLICT", "That username is already taken.", { reason: "taken" });
        case "needsUsername":
          return apiErrorResponse(context, 409, "CONFLICT", "Choose a username first.", { reason: "needsUsername" });
        case "invalid":
          return apiErrorResponse(context, 422, "VALIDATION_FAILED", "Use 3-30 lowercase letters, numbers, or underscores.", { field: "username" });
        case "missing":
          return apiErrorResponse(context, 401, "UNAUTHENTICATED", "Authentication is required.");
      }
    } catch (error) {
      console.error("dayli username change failed", error instanceof Error ? error.name : "unknown");
      return apiErrorResponse(context, 503, "SERVICE_UNAVAILABLE", "Profile storage is temporarily unavailable.");
    }
  });
}
