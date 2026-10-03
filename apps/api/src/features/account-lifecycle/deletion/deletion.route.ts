import { apiErrorSchema, utcTimestampSchema } from "@dayli/contracts";
import { createRoute, type OpenAPIHono, z } from "@hono/zod-openapi";
import type { AuthenticatedApiEnv } from "../../../http/authenticated-actor";
import { apiErrorResponse } from "../../../http/api-error";
import { createRequireSession, type ResolveSession } from "../../../http/middleware/require-session";
import { rateLimitedResponse, unavailableResponse, type ActorRateLimiter } from "../../../http/middleware/rate-limit";
import type { DeletionCancellationResult, DeletionRequestResult } from "../shared/deletion-commands.repository";
import type { DeletionStatus } from "../shared/deletion-status.repository";

export interface DeletionRouteDependencies {
  resolveSession: ResolveSession;
  rateLimiter?: ActorRateLimiter;
  status?: (userId: string) => Promise<DeletionStatus>;
  request?: (input: { userId: string; sessionId: string; grantToken: string; idempotencyKey: string }) => Promise<DeletionRequestResult>;
  cancel?: (input: { userId: string; sessionId: string; grantToken: string }) => Promise<DeletionCancellationResult>;
  /** Never enable until actor visibility, alerts, recovery, and synthetic-staging gates are verified. */
  requestEnabled?: boolean;
  revokeSessions?: (userId: string, sessionIds: readonly string[]) => Promise<void>;
  onRevocationFailure?: () => void;
}

const grantBody = z.object({ grantToken: z.string().regex(/^[0-9a-f]{64}$/) }).strict();
const requestBody = grantBody.openapi("DeletionGrantRequest");
const idempotencyHeader = z.string().regex(/^[A-Za-z0-9._~-]{16,128}$/);
const statusSchema = z.object({
  state: z.enum(["active", "pending_deletion", "purging", "purge_failed"]),
  generation: z.number().int().nonnegative(),
  requestId: z.string().nullable(),
  requestedAt: utcTimestampSchema.nullable(),
  cancelUntil: utcTimestampSchema.nullable(),
  purgeDueAt: utcTimestampSchema.nullable(),
}).openapi("AccountDeletionStatus");
const requestedSchema = z.object({
  status: z.enum(["requested", "already_requested"]),
  requestId: z.string(),
  requestedAt: utcTimestampSchema,
  cancelUntil: utcTimestampSchema,
  purgeDueAt: utcTimestampSchema,
}).openapi("AccountDeletionRequestResult");
const cancelledSchema = z.object({ status: z.literal("cancelled"), generation: z.number().int().nonnegative() })
  .openapi("AccountDeletionCancellationResult");
const error = (description: string) => ({ description, content: { "application/json": { schema: apiErrorSchema } } });
const security: Record<string, string[]>[] = [{ BearerAuth: [] }, { cookieAuth: [] }];
const statusPath = "/api/v1/account/deletion";
const requestPath = "/api/v1/account/deletion/request";
const cancelPath = "/api/v1/account/deletion/cancel";
const statusRoute = createRoute({
  method: "get", path: statusPath, tags: ["Account"], operationId: "account.getDeletionStatus",
  summary: "Read the authenticated account's deletion status",
  description: "Content-free state and database-timed deadlines. An absent lifecycle record is active.",
  security,
  responses: {
    200: { description: "Current account lifecycle state.", content: { "application/json": { schema: statusSchema } } },
    401: error("Authentication is required."),
    403: error("Account policy denies the read."),
    503: error("Status is temporarily unavailable."),
  },
});
const requestRoute = createRoute({
  method: "post", path: requestPath, tags: ["Account"], operationId: "account.requestDeletion",
  summary: "Request deletion after fresh action verification",
  description: "Requires a session-bound single-use grant and Idempotency-Key header. Production requests remain disabled until a separate activation decision. This operation does not physically purge content.",
  security,
  request: {
    headers: z.object({ "Idempotency-Key": idempotencyHeader }).openapi("DeletionIdempotencyHeaders"),
    body: { required: true, content: { "application/json": { schema: requestBody } } },
  },
  responses: {
    200: { description: "The same pending request already exists.", content: { "application/json": { schema: requestedSchema } } },
    201: { description: "Request recorded and ordinary sessions revoked.", content: { "application/json": { schema: requestedSchema } } },
    401: error("Authentication is required."),
    403: error("Account policy or the action proof denies this request."),
    409: error("The lifecycle already has a different request or is irreversible."),
    422: error("Malformed action grant or idempotency key."),
    429: error("Rate limit reached."),
    503: error("Requests are disabled or temporarily unavailable."),
  },
});
const cancelRoute = createRoute({
  method: "post", path: cancelPath, tags: ["Account"], operationId: "account.cancelDeletion",
  summary: "Cancel a pending deletion after fresh action verification",
  description: "Uses the database cancellation deadline. Revoked sessions and push registrations are not restored.",
  security,
  request: { body: { required: true, content: { "application/json": { schema: requestBody } } } },
  responses: {
    200: { description: "Deletion cancelled.", content: { "application/json": { schema: cancelledSchema } } },
    401: error("Authentication is required."),
    403: error("Account policy or the action proof denies cancellation."),
    409: error("No pending request exists or the cancellation deadline has passed."),
    422: error("Malformed action grant."),
    429: error("Rate limit reached."),
    503: error("Cancellation is temporarily unavailable."),
  },
});

function statusResponse(result: DeletionStatus) {
  return {
    ...result,
    requestedAt: result.requestedAt?.toISOString() ?? null,
    cancelUntil: result.cancelUntil?.toISOString() ?? null,
    purgeDueAt: result.purgeDueAt?.toISOString() ?? null,
  };
}

export function registerDeletionRoutes(app: OpenAPIHono<AuthenticatedApiEnv>, deps: DeletionRouteDependencies) {
  const requireSession = createRequireSession(deps.resolveSession);
  for (const path of [statusPath, requestPath, cancelPath]) app.use(path, requireSession);

  app.openapi(statusRoute, async (context) => {
    context.header("Cache-Control", "no-store");
    const actor = context.get("actor");
    if (!actor?.userId) return apiErrorResponse(context, 401, "UNAUTHENTICATED", "A live session is required.");
    if (!deps.status) return apiErrorResponse(context, 503, "SERVICE_UNAVAILABLE", "Deletion status is unavailable.");
    try {
      return context.json(statusResponse(await deps.status(actor.userId)), 200);
    } catch {
      return apiErrorResponse(context, 503, "SERVICE_UNAVAILABLE", "Deletion status is temporarily unavailable.");
    }
  });

  app.openapi(requestRoute, async (context) => {
    context.header("Cache-Control", "no-store");
    const actor = context.get("actor");
    if (!actor?.sessionId) return apiErrorResponse(context, 401, "UNAUTHENTICATED", "A live session is required.");
    if (!deps.requestEnabled || !deps.request || !deps.revokeSessions || !deps.rateLimiter || !deps.onRevocationFailure) {
      return apiErrorResponse(context, 503, "SERVICE_UNAVAILABLE", "Deletion requests are unavailable.");
    }
    const header = idempotencyHeader.safeParse(context.req.header("Idempotency-Key"));
    const body = grantBody.safeParse((context.req as unknown as { valid(key: "json"): unknown }).valid("json"));
    if (!header.success || !body.success) {
      return apiErrorResponse(context, 422, "VALIDATION_FAILED", "A valid action grant and idempotency key are required.");
    }
    const limit = await deps.rateLimiter.check(context.req.raw, actor);
    if (limit === "unavailable") return unavailableResponse(context);
    if (limit !== "allowed") return rateLimitedResponse(context);
    try {
      const result = await deps.request({
        userId: actor.userId, sessionId: actor.sessionId,
        grantToken: body.data.grantToken, idempotencyKey: header.data,
      });
      if (result.status === "invalid_grant") return apiErrorResponse(context, 403, "FORBIDDEN", "Action verification failed.");
      if (result.status === "conflict") return apiErrorResponse(context, 409, "CONFLICT", "The account lifecycle has changed.");
      if (!("requestId" in result)) return apiErrorResponse(context, 503, "SERVICE_UNAVAILABLE", "Deletion requests are unavailable.");
      if (result.status === "requested") {
        try {
          await deps.revokeSessions(actor.userId, result.revokedSessionIds);
        } catch {
          try { deps.onRevocationFailure(); } catch { /* The deletion already committed. */ }
        }
      } else {
        context.header("Idempotent-Replayed", "true");
      }
      return context.json({
        status: result.status, requestId: result.requestId,
        requestedAt: result.requestedAt.toISOString(),
        cancelUntil: result.cancelUntil.toISOString(),
        purgeDueAt: result.purgeDueAt.toISOString(),
      }, result.status === "requested" ? 201 : 200);
    } catch {
      return apiErrorResponse(context, 503, "SERVICE_UNAVAILABLE", "Deletion requests are temporarily unavailable.");
    }
  });

  app.openapi(cancelRoute, async (context) => {
    context.header("Cache-Control", "no-store");
    const actor = context.get("actor");
    if (!actor?.sessionId) return apiErrorResponse(context, 401, "UNAUTHENTICATED", "A live session is required.");
    if (!deps.cancel || !deps.rateLimiter) return apiErrorResponse(context, 503, "SERVICE_UNAVAILABLE", "Cancellation is unavailable.");
    const body = grantBody.safeParse((context.req as unknown as { valid(key: "json"): unknown }).valid("json"));
    if (!body.success) return apiErrorResponse(context, 422, "VALIDATION_FAILED", "A valid action grant is required.");
    const limit = await deps.rateLimiter.check(context.req.raw, actor);
    if (limit === "unavailable") return unavailableResponse(context);
    if (limit !== "allowed") return rateLimitedResponse(context);
    try {
      const result = await deps.cancel({ userId: actor.userId, sessionId: actor.sessionId, grantToken: body.data.grantToken });
      if (result.status === "invalid_grant") return apiErrorResponse(context, 403, "FORBIDDEN", "Action verification failed.");
      if (result.status === "expired" || result.status === "conflict") {
        return apiErrorResponse(context, 409, "CONFLICT", "Cancellation is not available for this account.");
      }
      if (!("generation" in result)) return apiErrorResponse(context, 503, "SERVICE_UNAVAILABLE", "Cancellation is unavailable.");
      return context.json({ status: result.status, generation: result.generation }, 200);
    } catch {
      return apiErrorResponse(context, 503, "SERVICE_UNAVAILABLE", "Cancellation is temporarily unavailable.");
    }
  });
}
