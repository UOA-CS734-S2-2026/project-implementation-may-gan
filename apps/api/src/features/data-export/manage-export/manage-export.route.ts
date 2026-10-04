import { apiErrorSchema, utcTimestampSchema } from "@dayli/contracts";
import { createRoute, type OpenAPIHono, z } from "@hono/zod-openapi";
import type { AuthenticatedApiEnv } from "../../../http/authenticated-actor";
import { apiErrorResponse } from "../../../http/api-error";
import { createRequireSession, type ResolveSession } from "../../../http/middleware/require-session";
import { rateLimitedResponse, unavailableResponse, type ActorRateLimiter } from "../../../http/middleware/rate-limit";
import type { ExportOwnerStatus } from "../shared/export-owner.repository";
import type { ExportDownload } from "../shared/export-download";

const security: Record<string, string[]>[] = [{ BearerAuth: [] }, { cookieAuth: [] }];
const error = (description: string) => ({ description, content: { "application/json": { schema: apiErrorSchema } } });
const base = "/api/v1/account/export";
const requestPath = `${base}/request`;
const downloadPath = `${base}/{requestId}/download`;
const status = z.object({
  requestId: z.string().nullable(),
  status: z.enum(["none", "requested", "building", "ready", "failed", "cancelled", "expired"]),
  requestedAt: utcTimestampSchema.nullable(),
  readyAt: utcTimestampSchema.nullable(),
  expiresAt: utcTimestampSchema.nullable(),
}).openapi("AccountExportStatus");
const requested = z.object({ requestId: z.string(), status: z.enum(["requested", "building", "ready", "expired"]),
  requestedAt: utcTimestampSchema }).openapi("AccountExportRequestResult");
const statusRoute = createRoute({ method: "get", path: base, tags: ["Account"], operationId: "account.getExportStatus",
  security, summary: "Read the owner's export request state",
  responses: { 200: { description: "Current export request state.", content: { "application/json": { schema: status } } },
    401: error("Authentication is required."), 403: error("Account policy denies this read."),
    503: error("Export is unavailable.") } });
const requestRoute = createRoute({ method: "post", path: requestPath, tags: ["Account"], operationId: "account.requestExport",
  security, summary: "Request one private account export",
  responses: { 200: { description: "An export request already exists.", content: { "application/json": { schema: requested } } },
    201: { description: "A new export was requested.", content: { "application/json": { schema: requested } } },
    401: error("Authentication is required."), 403: error("Account policy denies this request."),
    429: error("Rate limit reached."), 503: error("Export is unavailable.") } });
const downloadRoute = createRoute({ method: "get", path: downloadPath, tags: ["Account"],
  operationId: "account.downloadExport", security,
  summary: "Download a ready export through a fresh authenticated stream",
  request: { params: z.object({ requestId: z.string().uuid() }) },
  responses: { 200: { description: "Private ZIP archive.", content: { "application/zip": {
    schema: z.string().openapi({ format: "binary" }),
  } } }, 401: error("Authentication is required."), 403: error("Account policy denies this download."),
  404: error("No ready export exists for this session."), 503: error("Export is unavailable.") } });

export interface ExportRouteDependencies {
  resolveSession: ResolveSession;
  rateLimiter?: ActorRateLimiter;
  /** Disabled even when route dependencies are present until owner approval and provider proof. */
  enabled?: boolean;
  /** A staging proof may admit only its one disposable account. */
  allowedUserId?: string;
  status?: (userId: string, sessionId: string) => Promise<ExportOwnerStatus | null>;
  request?: (userId: string, sessionId: string, requestId: string) => Promise<{
    requestId: string; status: "requested" | "building" | "ready" | "expired"; requestedAt: string;
  } | null>;
  download?: (userId: string, sessionId: string, requestId: string) => Promise<ExportDownload | null>;
}

export function registerExportRoutes(app: OpenAPIHono<AuthenticatedApiEnv>, deps: ExportRouteDependencies) {
  const requireSession = createRequireSession(deps.resolveSession);
  app.use(base, requireSession);
  app.use(requestPath, requireSession);
  app.use(`${base}/:requestId/download`, requireSession);
  app.openapi(statusRoute, async (context) => {
    context.header("Cache-Control", "no-store");
    const actor = context.get("actor");
    if (!actor?.sessionId) return apiErrorResponse(context, 401, "UNAUTHENTICATED", "A live session is required.");
    if (!deps.enabled || (deps.allowedUserId !== undefined && deps.allowedUserId !== actor.userId) || !deps.status) return apiErrorResponse(context, 503, "SERVICE_UNAVAILABLE", "Export is unavailable.");
    try {
      const state = await deps.status(actor.userId, actor.sessionId);
      return context.json(state ?? { requestId: null, status: "none" as const, requestedAt: null, readyAt: null, expiresAt: null }, 200);
    } catch { return apiErrorResponse(context, 503, "SERVICE_UNAVAILABLE", "Export is temporarily unavailable."); }
  });
  app.openapi(requestRoute, async (context) => {
    context.header("Cache-Control", "no-store");
    const actor = context.get("actor");
    if (!actor?.sessionId) return apiErrorResponse(context, 401, "UNAUTHENTICATED", "A live session is required.");
    if (!deps.enabled || (deps.allowedUserId !== undefined && deps.allowedUserId !== actor.userId) || !deps.request || !deps.rateLimiter) {
      return apiErrorResponse(context, 503, "SERVICE_UNAVAILABLE", "Export is unavailable.");
    }
    const limit = await deps.rateLimiter.check(context.req.raw, actor);
    if (limit === "unavailable") return unavailableResponse(context);
    if (limit !== "allowed") return rateLimitedResponse(context);
    try {
      const newId = crypto.randomUUID();
      const result = await deps.request(actor.userId, actor.sessionId, newId);
      if (!result) return apiErrorResponse(context, 403, "FORBIDDEN", "Export is unavailable for this account.");
      return context.json(result, result.requestId === newId ? 201 : 200);
    } catch { return apiErrorResponse(context, 503, "SERVICE_UNAVAILABLE", "Export is temporarily unavailable."); }
  });
  app.openapi(downloadRoute, async (context) => {
    context.header("Cache-Control", "no-store");
    const actor = context.get("actor");
    if (!actor?.sessionId) return apiErrorResponse(context, 401, "UNAUTHENTICATED", "A live session is required.");
    if (!deps.enabled || (deps.allowedUserId !== undefined && deps.allowedUserId !== actor.userId) || !deps.download) return apiErrorResponse(context, 503, "SERVICE_UNAVAILABLE", "Export is unavailable.");
    try {
      const download = await deps.download(actor.userId, actor.sessionId, context.req.valid("param").requestId);
      if (!download) return apiErrorResponse(context, 404, "NOT_FOUND", "No ready export was found.");
      return context.newResponse(download.body, 200, {
        "Content-Type": "application/zip", "Content-Disposition": 'attachment; filename="dayli-export-v2.zip"',
        "Content-Length": String(download.size), "Cache-Control": "no-store, private", "X-Content-Type-Options": "nosniff",
      });
    } catch { return apiErrorResponse(context, 503, "SERVICE_UNAVAILABLE", "Export is temporarily unavailable."); }
  });
}
