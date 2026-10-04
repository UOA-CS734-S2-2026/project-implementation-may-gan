import { createRoute, type OpenAPIHono } from "@hono/zod-openapi";
import { apiErrorResponse } from "../../../http/api-error";
import type { AuthenticatedApiEnv } from "../../../http/authenticated-actor";
import { createRequireSession, type ResolveSession } from "../../../http/middleware/require-session";
import type { ActorRateLimiter } from "../../../http/middleware/rate-limit";
import { postIdParamsSchema } from "../shared/post-detail.contract";
import { listPostRevisionsErrorResponses, postRevisionsPageSchema, postRevisionsQuerySchema } from "./list-post-revisions.contract";
import { InvalidRevisionCursorError, type PostRevisionsRepository } from "./list-post-revisions.repository";

export interface ListPostRevisionsRouteDependencies {
  /** Resolves the Better Auth cookie or bearer session; never trusts a request-supplied user. */
  resolveSession: ResolveSession;
  repository?: PostRevisionsRepository;
  now?: () => Date;
  rateLimiter?: ActorRateLimiter;
}

const security: Array<Record<string, string[]>> = [{ BearerAuth: [] }, { cookieAuth: [] }];

const listPostRevisionsRoute = createRoute({
  method: "get",
  path: "/api/v1/posts/{postId}/revisions",
  tags: ["Posts"],
  operationId: "posts.listRevisions",
  summary: "List a post's earlier versions",
  description: "Returns earlier versions of a post the caller may read, newest first. The author sees every version. Anyone else sees only versions that were already shared with friends, so text written while the post was solo stays private. A missing post and a post the caller may not read both return 404.",
  security,
  request: { params: postIdParamsSchema, query: postRevisionsQuerySchema },
  responses: {
    200: {
      description: "One page of earlier versions.",
      content: { "application/json": { schema: postRevisionsPageSchema } },
    },
    ...listPostRevisionsErrorResponses,
  },
});

export function registerListPostRevisionsRoute(app: OpenAPIHono<AuthenticatedApiEnv>, dependencies: ListPostRevisionsRouteDependencies) {
  app.use("/api/v1/posts/:postId/revisions", createRequireSession(dependencies.resolveSession, dependencies.rateLimiter));
  app.openapi(listPostRevisionsRoute, async (context) => {
    context.header("Cache-Control", "no-store");
    if (!dependencies.repository) {
      return apiErrorResponse(context, 503, "SERVICE_UNAVAILABLE", "Post storage is temporarily unavailable.");
    }

    const { postId } = context.req.valid("param");
    const { limit, cursor } = context.req.valid("query");
    const now = dependencies.now?.() ?? new Date();
    try {
      const page = await dependencies.repository.listRevisions(context.get("actor").userId, postId, now, limit, cursor);
      if (!page) return apiErrorResponse(context, 404, "NOT_FOUND", "The post was not found.");
      return context.json(page, 200);
    } catch (error) {
      if (error instanceof InvalidRevisionCursorError) {
        return apiErrorResponse(context, 422, "VALIDATION_FAILED", "The request contains invalid values.", { field: "cursor" });
      }
      console.error("dayli post revisions read failed", error instanceof Error ? error.name : "unknown");
      return apiErrorResponse(context, 503, "SERVICE_UNAVAILABLE", "Post storage is temporarily unavailable.");
    }
  });
}
