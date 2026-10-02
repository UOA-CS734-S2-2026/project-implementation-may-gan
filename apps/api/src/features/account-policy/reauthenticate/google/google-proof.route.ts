import { apiErrorSchema, utcTimestampSchema } from "@dayli/contracts";
import { createRoute, type OpenAPIHono, z } from "@hono/zod-openapi";
import type { AuthenticatedApiEnv } from "../../../../http/authenticated-actor";
import { apiErrorResponse } from "../../../../http/api-error";
import { createRequireSession, type ResolveSession } from "../../../../http/middleware/require-session";
import { rateLimitedResponse, unavailableResponse, type ActorRateLimiter } from "../../../../http/middleware/rate-limit";
import type { AccountManagementAction } from "../password/password.repository";

export interface GoogleManagementProofDependencies {
  resolveSession: ResolveSession;
  rateLimiter?: ActorRateLimiter;
  begin?: (input: { userId: string; sessionId: string; action: AccountManagementAction }) => Promise<{ url: string; expiresAt: Date } | null>;
}

const path = "/api/v1/account/reauthenticate/google";
const actionSchema = z.object({ action: z.enum(["request_deletion", "cancel_deletion"]) }).strict().openapi("GoogleReauthenticationRequest");
const resultSchema = z.object({ authorizationUrl: z.url(), expiresAt: utcTimestampSchema }).openapi("GoogleReauthenticationIntent");
const error = (description: string) => ({ description, content: { "application/json": { schema: apiErrorSchema } } });
const route = createRoute({
  method: "post", path, tags: ["Account"], operationId: "account.beginGoogleReauthentication",
  summary: "Start browser Google verification for one account action",
  description: "A browser-only authorization-code flow. It does not sign in, link an account, or request deletion. The callback requires the original live session and a fresh signed Google authentication time.",
  security: [{ BearerAuth: [] }, { cookieAuth: [] }],
  request: { body: { required: true, content: { "application/json": { schema: actionSchema } } } },
  responses: {
    200: { description: "Google authorization URL for the current session.", content: { "application/json": { schema: resultSchema } } },
    401: error("A live session is required."), 403: error("Account policy denies this action."),
    409: error("No linked Google account or the account state changed."),
    422: error("Malformed action."), 429: error("Reauthentication is rate limited."),
    503: error("Google proof or rate limiting is temporarily unavailable."),
  },
});

export function registerGoogleManagementProofRoute(app: OpenAPIHono<AuthenticatedApiEnv>, deps: GoogleManagementProofDependencies) {
  app.on("POST", path, createRequireSession(deps.resolveSession));
  app.openapi(route, async (context) => {
    context.header("Cache-Control", "no-store");
    const actor = context.get("actor");
    if (!actor?.sessionId) return apiErrorResponse(context, 401, "UNAUTHENTICATED", "A live session is required.");
    if (!deps.begin || !deps.rateLimiter) return apiErrorResponse(context, 503, "SERVICE_UNAVAILABLE", "Google verification is unavailable.");
    const input = actionSchema.safeParse((context.req as unknown as { valid(key: "json"): unknown }).valid("json"));
    if (!input.success) return apiErrorResponse(context, 422, "VALIDATION_FAILED", "A valid action is required.");
    const limit = await deps.rateLimiter.check(context.req.raw, actor);
    if (limit === "unavailable") return unavailableResponse(context);
    if (limit !== "allowed") return rateLimitedResponse(context);
    try {
      const intent = await deps.begin({ ...input.data, userId: actor.userId, sessionId: actor.sessionId });
      return intent
        ? context.json({ authorizationUrl: intent.url, expiresAt: intent.expiresAt.toISOString() }, 200)
        : apiErrorResponse(context, 409, "CONFLICT", "A linked Google account or eligible session is required.");
    } catch {
      return apiErrorResponse(context, 503, "SERVICE_UNAVAILABLE", "Google verification is temporarily unavailable.");
    }
  });
}
