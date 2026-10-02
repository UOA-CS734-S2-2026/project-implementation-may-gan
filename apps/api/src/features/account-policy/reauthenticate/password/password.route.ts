import { apiErrorSchema, utcTimestampSchema } from "@dayli/contracts";
import { createRoute, type OpenAPIHono, z } from "@hono/zod-openapi";
import type { AuthenticatedApiEnv } from "../../../../http/authenticated-actor";
import { apiErrorResponse } from "../../../../http/api-error";
import { createRequireSession, type ResolveSession } from "../../../../http/middleware/require-session";
import { rateLimitedResponse, unavailableResponse, type ActorRateLimiter } from "../../../../http/middleware/rate-limit";
import type { AccountManagementAction, PasswordGrantResult } from "./password.repository";

export interface PasswordReauthenticationDependencies {
  resolveSession: ResolveSession;
  rateLimiter?: ActorRateLimiter;
  issue?: (input: { userId: string; sessionId: string; action: AccountManagementAction; password: string }) => Promise<PasswordGrantResult>;
}

const requestSchema = z.object({
  action: z.enum(["request_deletion", "cancel_deletion"]),
  password: z.string().min(1).max(1024),
}).strict().openapi("PasswordReauthenticationRequest");
const responseSchema = z.object({
  token: z.string().regex(/^[0-9a-f]{64}$/),
  expiresAt: utcTimestampSchema,
  action: z.enum(["request_deletion", "cancel_deletion"]),
}).openapi("PasswordReauthenticationGrant");
const error = (description: string) => ({ description, content: { "application/json": { schema: apiErrorSchema } } });
const path = "/api/v1/account/reauthenticate/password";
const route = createRoute({
  method: "post", path, tags: ["Account"], operationId: "account.reauthenticatePassword",
  summary: "Verify a password for one account management action",
  description: "Issues a session-bound, single-use five-minute grant. This does not request or cancel deletion. Google-only accounts require a separate verified Google action.",
  security: [{ BearerAuth: [] }, { cookieAuth: [] }],
  request: { body: { required: true, content: { "application/json": { schema: requestSchema } } } },
  responses: {
    200: { description: "Short-lived action grant.", content: { "application/json": { schema: responseSchema } } },
    401: error("Authentication or password verification failed."),
    403: error("Account policy denies the action."),
    409: error("The account has no password or its lifecycle changed."),
    422: error("Malformed action or password."),
    429: error("The actor's reauthentication rate limit was reached."),
    503: error("Verification or rate limiting is temporarily unavailable."),
  },
});

export function registerPasswordReauthenticationRoute(app: OpenAPIHono<AuthenticatedApiEnv>, deps: PasswordReauthenticationDependencies) {
  app.on("POST", path, createRequireSession(deps.resolveSession));
  app.openapi(route, async (context) => {
    context.header("Cache-Control", "no-store");
    const actor = context.get("actor");
    if (!actor?.sessionId) return apiErrorResponse(context, 401, "UNAUTHENTICATED", "A live session is required.");
    if (!deps.issue || !deps.rateLimiter) return apiErrorResponse(context, 503, "SERVICE_UNAVAILABLE", "Password verification is unavailable.");
    const input = requestSchema.safeParse((context.req as unknown as { valid(key: "json"): unknown }).valid("json"));
    if (!input.success) return apiErrorResponse(context, 422, "VALIDATION_FAILED", "A valid action and password are required.");
    const limit = await deps.rateLimiter.check(context.req.raw, actor);
    if (limit === "unavailable") return unavailableResponse(context);
    if (limit !== "allowed") return rateLimitedResponse(context);
    try {
      const result = await deps.issue({ ...input.data, userId: actor.userId, sessionId: actor.sessionId });
      switch (result.status) {
        case "issued":
          return context.json({ token: result.token, action: input.data.action, expiresAt: result.expiresAt.toISOString() }, 200);
        case "invalid_password":
          return apiErrorResponse(context, 401, "UNAUTHENTICATED", "Password verification failed.");
        case "password_unavailable":
          return apiErrorResponse(context, 409, "CONFLICT", "This account cannot verify with a password.", { proof: "google_required" });
        case "restricted":
          return apiErrorResponse(context, 409, "CONFLICT", "The account action or session has changed.");
      }
    } catch {
      return apiErrorResponse(context, 503, "SERVICE_UNAVAILABLE", "Password verification is temporarily unavailable.");
    }
  });
}
