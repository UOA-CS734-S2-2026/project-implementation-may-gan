import { createRoute, type OpenAPIHono, z } from "@hono/zod-openapi";
import type { Context } from "hono";
import { opaqueIdSchema, utcTimestampSchema, aucklandDateSchema, apiErrorSchema } from "@dayli/contracts";
import type { AuthenticatedApiEnv } from "../../../http/authenticated-actor";
import { apiErrorResponse } from "../../../http/api-error";
import { createRequireSession, type ResolveSession } from "../../../http/middleware/require-session";
import type { ActorRateLimiter } from "../../../http/middleware/rate-limit";
import type { PostTrashRepository, TrashedPostStatus } from "./trash-post.repository";

export interface PostTrashRouteDependencies {
  resolveSession: ResolveSession;
  repository?: PostTrashRepository;
  rateLimiter?: ActorRateLimiter;
}

const security: Array<Record<string, string[]>> = [{ BearerAuth: [] }, { cookieAuth: [] }];
const error = (description: string) => ({ description, content: { "application/json": { schema: apiErrorSchema } } });
const statusSchema = z.object({
  id: opaqueIdSchema,
  localDate: aucklandDateSchema,
  trashedAt: utcTimestampSchema,
  restoreUntil: utcTimestampSchema,
  purgeDueAt: utcTimestampSchema,
  generation: z.number().int().nonnegative(),
  pendingCleanup: z.boolean(),
  failureCategory: z.string().nullable(),
}).openapi("TrashedPostStatus");
const listRoute = createRoute({
  method: "get", path: "/api/v1/posts/trash", tags: ["Posts"], operationId: "posts.listTrash",
  summary: "List the authenticated owner's trashed posts", security,
  responses: { 200: { description: "Owner-only Trash status.", content: { "application/json": { schema: z.object({ posts: z.array(statusSchema) }) } } }, 401: error("Authentication is required."), 503: error("Post Trash is disabled or unavailable.") },
});
const trashRoute = createRoute({
  method: "post", path: "/api/v1/posts/{postId}/trash", tags: ["Posts"], operationId: "posts.trash",
  summary: "Move an owned post to Trash", security,
  request: { params: z.object({ postId: opaqueIdSchema }) },
  responses: { 200: { description: "Post Trash state.", content: { "application/json": { schema: statusSchema } } }, 401: error("Authentication is required."), 404: error("Post not found."), 409: error("Post cannot be moved to Trash."), 503: error("Post Trash is disabled or unavailable.") },
});
const restoreRoute = createRoute({
  method: "post", path: "/api/v1/posts/{postId}/restore", tags: ["Posts"], operationId: "posts.restore",
  summary: "Restore an owned post from Trash", security,
  request: { params: z.object({ postId: opaqueIdSchema }) },
  responses: { 200: { description: "Post restored.", content: { "application/json": { schema: z.object({ status: z.literal("restored") }) } } }, 401: error("Authentication is required."), 404: error("Post not found."), 409: error("Post cannot be restored."), 503: error("Post Trash is disabled or unavailable.") },
});

function response(status: TrashedPostStatus) {
  return { ...status, trashedAt: status.trashedAt.toISOString(), restoreUntil: status.restoreUntil.toISOString(), purgeDueAt: status.purgeDueAt.toISOString() };
}

export function registerPostTrashRoutes(app: OpenAPIHono<AuthenticatedApiEnv>, dependencies: PostTrashRouteDependencies) {
  for (const path of ["/api/v1/posts/trash", "/api/v1/posts/:postId/trash", "/api/v1/posts/:postId/restore"]) {
    app.use(path, createRequireSession(dependencies.resolveSession, dependencies.rateLimiter));
  }
  const unavailable = <E extends AuthenticatedApiEnv>(context: Context<E>) => apiErrorResponse(context, 503, "SERVICE_UNAVAILABLE", "Post Trash is disabled.");
  app.openapi(listRoute, async (context) => {
    context.header("Cache-Control", "no-store");
    if (!dependencies.repository) return unavailable(context);
    try { return context.json({ posts: (await dependencies.repository.list(context.get("actor").userId)).map(response) }, 200); }
    catch { return unavailable(context); }
  });
  app.openapi(trashRoute, async (context) => {
    context.header("Cache-Control", "no-store");
    const actor = context.get("actor");
    if (!actor.sessionId) return apiErrorResponse(context, 401, "UNAUTHENTICATED", "A live session is required.");
    if (!dependencies.repository) return unavailable(context);
    try {
      const result = await dependencies.repository.transition({ userId: actor.userId, sessionId: actor.sessionId, postId: context.req.valid("param").postId, action: "trash" });
      if (result.outcome === "not_found") return apiErrorResponse(context, 404, "NOT_FOUND", "Post not found.");
      if (result.outcome === "invalid_session") return apiErrorResponse(context, 401, "UNAUTHENTICATED", "The session is no longer valid.");
      if (result.outcome !== "trashed" && result.outcome !== "already_trashed") return apiErrorResponse(context, 409, "CONFLICT", "The post cannot be moved to Trash.", { reason: result.outcome });
      return result.status ? context.json(response(result.status), 200) : unavailable(context);
    } catch { return unavailable(context); }
  });
  app.openapi(restoreRoute, async (context) => {
    context.header("Cache-Control", "no-store");
    const actor = context.get("actor");
    if (!actor.sessionId) return apiErrorResponse(context, 401, "UNAUTHENTICATED", "A live session is required.");
    if (!dependencies.repository) return unavailable(context);
    try {
      const result = await dependencies.repository.transition({ userId: actor.userId, sessionId: actor.sessionId, postId: context.req.valid("param").postId, action: "restore" });
      if (result.outcome === "not_found") return apiErrorResponse(context, 404, "NOT_FOUND", "Post not found.");
      if (result.outcome === "invalid_session") return apiErrorResponse(context, 401, "UNAUTHENTICATED", "The session is no longer valid.");
      if (result.outcome !== "restored" && result.outcome !== "already_active") return apiErrorResponse(context, 409, "CONFLICT", "The post cannot be restored.", { reason: result.outcome });
      return context.json({ status: "restored" as const }, 200);
    } catch { return unavailable(context); }
  });
}
