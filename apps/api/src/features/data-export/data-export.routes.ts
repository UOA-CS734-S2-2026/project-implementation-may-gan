import { createRoute, type OpenAPIHono, z } from "@hono/zod-openapi";
import type { DayliDatabase } from "@dayli/db";
import { apiErrorResponse } from "../../http/api-error";
import type { AuthenticatedApiEnv } from "../../http/authenticated-actor";
import type { ResolveSession } from "../../http/middleware/require-session";
import { createRequireSession } from "../../http/middleware/require-session";
import { ExportUnavailableError, createPostgresDataExportStore, type DataExportRecord, type DataExportStore } from "./shared/data-export.repository";
import type { ExportArchiveReader } from "./shared/export-archive-reader";

const security: Array<Record<string, string[]>> = [{ BearerAuth: [] }, { cookieAuth: [] }];
const exportStatusSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(["requested", "building", "ready", "failed", "cancelled", "expired"]),
  requestedAt: z.string().datetime(),
  readyAt: z.string().datetime().nullable(),
  expiresAt: z.string().datetime().nullable(),
  downloadable: z.boolean(),
});
const requestRoute = createRoute({ method: "post", path: "/api/v1/account/export", tags: ["Account"], operationId: "account.requestDataExport", security, responses: { 202: { description: "Existing or newly queued export.", content: { "application/json": { schema: exportStatusSchema } } }, 401: { description: "No current session." }, 403: { description: "Account cannot export." }, 409: { description: "Export unavailable." }, 503: { description: "Export service unavailable." } } });
const statusRoute = createRoute({ method: "get", path: "/api/v1/account/export", tags: ["Account"], operationId: "account.getDataExport", security, responses: { 200: { description: "Current export, if any.", content: { "application/json": { schema: z.object({ export: exportStatusSchema.nullable() }) } } }, 401: { description: "No current session." }, 503: { description: "Export service unavailable." } } });
const cancelRoute = createRoute({ method: "delete", path: "/api/v1/account/export", tags: ["Account"], operationId: "account.cancelDataExport", security, responses: { 200: { description: "Queued export cancelled when it has not published an archive.", content: { "application/json": { schema: z.object({ export: exportStatusSchema.nullable() }) } } }, 401: { description: "No current session." }, 503: { description: "Export service unavailable." } } });
const downloadRoute = createRoute({ method: "get", path: "/api/v1/account/export/download", tags: ["Account"], operationId: "account.downloadDataExport", security, responses: { 200: { description: "Authenticated archive bytes.", content: { "application/zip": { schema: z.string().openapi({ format: "binary" }) } } }, 401: { description: "No current session." }, 403: { description: "Export is not ready or has expired." }, 503: { description: "Export service unavailable." } } });

export interface DataExportRouteDependencies {
  resolveSession: ResolveSession;
  store?: DataExportStore;
  withDatabase?<T>(run: (database: DayliDatabase) => Promise<T>): Promise<T>;
  archiveReader?: ExportArchiveReader;
  trustedOrigins?: readonly string[];
}

function originPermitted(request: Request, trustedOrigins: readonly string[]): boolean {
  const origin = request.headers.get("origin");
  return !origin || trustedOrigins.includes(origin);
}

function serialize(row: DataExportRecord) {
  return {
    id: row.id, status: row.status, requestedAt: row.requestedAt.toISOString(),
    readyAt: row.readyAt?.toISOString() ?? null, expiresAt: row.expiresAt?.toISOString() ?? null,
    downloadable: row.status === "ready" && row.expiresAt !== null && row.expiresAt.getTime() > Date.now(),
  };
}

async function withStore<T>(deps: DataExportRouteDependencies, run: (store: DataExportStore) => Promise<T>): Promise<T | undefined> {
  if (deps.store) return run(deps.store);
  return deps.withDatabase ? deps.withDatabase((database) => run(createPostgresDataExportStore(database))) : undefined;
}

/** Export download remains a same-origin API response. It never returns a durable object key or signed object URL. */
export function registerDataExportRoutes(app: OpenAPIHono<AuthenticatedApiEnv>, deps: DataExportRouteDependencies) {
  const requireSession = createRequireSession(deps.resolveSession);
  app.use("/api/v1/account/export", requireSession);
  app.use("/api/v1/account/export/download", requireSession);

  app.openapi(requestRoute, async (context) => {
    if (!originPermitted(context.req.raw, deps.trustedOrigins ?? [])) return apiErrorResponse(context, 403, "FORBIDDEN", "Export is unavailable.");
    const actor = context.get("actor");
    if (!actor?.userId) return apiErrorResponse(context, 401, "UNAUTHENTICATED", "Authentication is required.");
    try {
      const requested = await withStore(deps, (store) => store.request(actor.userId));
      if (!requested) return apiErrorResponse(context, 503, "SERVICE_UNAVAILABLE", "Export service is temporarily unavailable.");
      context.header("Cache-Control", "no-store");
      return context.json(serialize(requested), 202);
    } catch (error) {
      if (error instanceof ExportUnavailableError) return apiErrorResponse(context, 409, "CONFLICT", "Export is unavailable.");
      return apiErrorResponse(context, 503, "SERVICE_UNAVAILABLE", "Export service is temporarily unavailable.");
    }
  });

  app.openapi(statusRoute, async (context) => {
    const actor = context.get("actor");
    if (!actor?.userId) return apiErrorResponse(context, 401, "UNAUTHENTICATED", "Authentication is required.");
    try { const current = await withStore(deps, (store) => store.current(actor.userId)); if (current === undefined) return apiErrorResponse(context, 503, "SERVICE_UNAVAILABLE", "Export service is temporarily unavailable."); context.header("Cache-Control", "no-store"); return context.json({ export: current ? serialize(current) : null }, 200); }
    catch { return apiErrorResponse(context, 503, "SERVICE_UNAVAILABLE", "Export service is temporarily unavailable."); }
  });

  app.openapi(cancelRoute, async (context) => {
    if (!originPermitted(context.req.raw, deps.trustedOrigins ?? [])) return apiErrorResponse(context, 403, "FORBIDDEN", "Export is unavailable.");
    const actor = context.get("actor");
    if (!actor?.userId) return apiErrorResponse(context, 401, "UNAUTHENTICATED", "Authentication is required.");
    try { const cancelled = await withStore(deps, (store) => store.cancel(actor.userId)); if (cancelled === undefined) return apiErrorResponse(context, 503, "SERVICE_UNAVAILABLE", "Export service is temporarily unavailable."); context.header("Cache-Control", "no-store"); return context.json({ export: cancelled ? serialize(cancelled) : null }, 200); }
    catch { return apiErrorResponse(context, 503, "SERVICE_UNAVAILABLE", "Export service is temporarily unavailable."); }
  });

  app.openapi(downloadRoute, async (context) => {
    const actor = context.get("actor");
    if (!actor?.userId) return apiErrorResponse(context, 401, "UNAUTHENTICATED", "Authentication is required.");
    if (!deps.archiveReader) return apiErrorResponse(context, 503, "SERVICE_UNAVAILABLE", "Export service is temporarily unavailable.");
    try {
      // This fresh database check is intentionally immediately before object access.
      const exportRecord = await withStore(deps, (store) => store.authorizeDownload(actor.userId));
      if (exportRecord === undefined) return apiErrorResponse(context, 503, "SERVICE_UNAVAILABLE", "Export service is temporarily unavailable.");
      if (!exportRecord?.archiveObjectKey) return apiErrorResponse(context, 403, "FORBIDDEN", "Export is not ready.");
      const body = await deps.archiveReader.open(exportRecord.archiveObjectKey);
      if (!body) return apiErrorResponse(context, 403, "FORBIDDEN", "Export is not ready.");
      return new Response(body, { headers: {
        "Content-Type": "application/zip", "Cache-Control": "no-store", "Content-Disposition": 'attachment; filename="dayli-data-export.zip"',
        "X-Content-Type-Options": "nosniff",
      } });
    } catch { return apiErrorResponse(context, 503, "SERVICE_UNAVAILABLE", "Export service is temporarily unavailable."); }
  });
}
