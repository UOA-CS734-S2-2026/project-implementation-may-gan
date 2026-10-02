import { cursorPaginationQuerySchema } from "@dayli/contracts";
import { createRoute, type OpenAPIHono } from "@hono/zod-openapi";
import { apiErrorResponse } from "../../../http/api-error";
import type { AuthenticatedApiEnv } from "../../../http/authenticated-actor";
import { createRequireSession, type ResolveSession } from "../../../http/middleware/require-session";
import type { ActorRateLimiter } from "../../../http/middleware/rate-limit";
import { InvalidInteractionCursorError } from "../shared/interaction-cursor";
import { interactionErrorResponses, interactionPostParamsSchema } from "../shared/interactions.contract";
import { postCommentsPageSchema } from "./list-post-comments.contract";
import type { PostCommentsRepository } from "./list-post-comments.repository";

export interface ListPostCommentsRouteDependencies {
  /** Resolves the Better Auth cookie or bearer session; never trusts a request-supplied user. */
  resolveSession: ResolveSession;
  repository?: PostCommentsRepository;
  now?: () => Date;
  rateLimiter?: ActorRateLimiter;
}

const security: Array<Record<string, string[]>> = [{ BearerAuth: [] }, { cookieAuth: [] }];

const listPostCommentsRoute = createRoute({
  method: "get",
  path: "/api/v1/posts/{postId}/comments",
  tags: ["Interactions"],
  operationId: "interactions.listComments",
  summary: "List the comments on a post",
  description: "Returns comments and replies on a post the caller may read, oldest first. Deleted comments, replies under a deleted comment, and comments by people across a block from the caller are left out. Each comment says whether the caller may edit or delete it.",
  security,
  request: { params: interactionPostParamsSchema, query: cursorPaginationQuerySchema.openapi("PostCommentsQuery") },
  responses: {
    200: {
      description: "One page of comments and replies.",
      content: { "application/json": { schema: postCommentsPageSchema } },
    },
    ...interactionErrorResponses,
  },
});

export function registerListPostCommentsRoute(app: OpenAPIHono<AuthenticatedApiEnv>, dependencies: ListPostCommentsRouteDependencies) {
  app.on("GET", "/api/v1/posts/:postId/comments", createRequireSession(dependencies.resolveSession, dependencies.rateLimiter));
  app.openapi(listPostCommentsRoute, async (context) => {
    context.header("Cache-Control", "no-store");
    if (!dependencies.repository) {
      return apiErrorResponse(context, 503, "SERVICE_UNAVAILABLE", "Interaction storage is temporarily unavailable.");
    }

    const { postId } = context.req.valid("param");
    const { limit, cursor } = context.req.valid("query");
    const now = dependencies.now?.() ?? new Date();
    try {
      const page = await dependencies.repository.listComments(context.get("actor").userId, postId, now, limit, cursor);
      if (!page) return apiErrorResponse(context, 404, "NOT_FOUND", "The post was not found.");
      return context.json(page, 200);
    } catch (error) {
      if (error instanceof InvalidInteractionCursorError) {
        return apiErrorResponse(context, 422, "VALIDATION_FAILED", "The request contains invalid values.", { field: "cursor" });
      }
      console.error("dayli post comments read failed", error instanceof Error ? error.name : "unknown");
      return apiErrorResponse(context, 503, "SERVICE_UNAVAILABLE", "Interaction storage is temporarily unavailable.");
    }
  });
}
