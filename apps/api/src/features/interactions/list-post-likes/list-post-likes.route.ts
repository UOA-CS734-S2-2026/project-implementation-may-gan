import { cursorPaginationQuerySchema } from "@dayli/contracts";
import { createRoute, type OpenAPIHono } from "@hono/zod-openapi";
import { apiErrorResponse } from "../../../http/api-error";
import type { AuthenticatedApiEnv } from "../../../http/authenticated-actor";
import { createRequireSession, type ResolveSession } from "../../../http/middleware/require-session";
import type { ActorRateLimiter } from "../../../http/middleware/rate-limit";
import { InvalidInteractionCursorError } from "../shared/interaction-cursor";
import { interactionErrorResponses, interactionPostParamsSchema } from "../shared/interactions.contract";
import { postLikesPageSchema } from "./list-post-likes.contract";
import type { PostLikesRepository } from "./list-post-likes.repository";

export interface ListPostLikesRouteDependencies {
  /** Resolves the Better Auth cookie or bearer session; never trusts a request-supplied user. */
  resolveSession: ResolveSession;
  repository?: PostLikesRepository;
  now?: () => Date;
  rateLimiter?: ActorRateLimiter;
}

const security: Array<Record<string, string[]>> = [{ BearerAuth: [] }, { cookieAuth: [] }];

const listPostLikesRoute = createRoute({
  method: "get",
  path: "/api/v1/posts/{postId}/likes",
  tags: ["Interactions"],
  operationId: "interactions.listLikes",
  summary: "List who liked a post",
  description: "Returns the people who liked a post the caller may read, newest first. People the caller has blocked, or who blocked the caller, are left out.",
  security,
  request: { params: interactionPostParamsSchema, query: cursorPaginationQuerySchema.openapi("PostLikesQuery") },
  responses: {
    200: {
      description: "One page of likes.",
      content: { "application/json": { schema: postLikesPageSchema } },
    },
    ...interactionErrorResponses,
  },
});

export function registerListPostLikesRoute(app: OpenAPIHono<AuthenticatedApiEnv>, dependencies: ListPostLikesRouteDependencies) {
  app.on("GET", "/api/v1/posts/:postId/likes", createRequireSession(dependencies.resolveSession, dependencies.rateLimiter));
  app.openapi(listPostLikesRoute, async (context) => {
    context.header("Cache-Control", "no-store");
    if (!dependencies.repository) {
      return apiErrorResponse(context, 503, "SERVICE_UNAVAILABLE", "Interaction storage is temporarily unavailable.");
    }

    const { postId } = context.req.valid("param");
    const { limit, cursor } = context.req.valid("query");
    const now = dependencies.now?.() ?? new Date();
    try {
      const page = await dependencies.repository.listLikes(context.get("actor").userId, postId, now, limit, cursor);
      if (!page) return apiErrorResponse(context, 404, "NOT_FOUND", "The post was not found.");
      return context.json(page, 200);
    } catch (error) {
      if (error instanceof InvalidInteractionCursorError) {
        return apiErrorResponse(context, 422, "VALIDATION_FAILED", "The request contains invalid values.", { field: "cursor" });
      }
      console.error("dayli post likes read failed", error instanceof Error ? error.name : "unknown");
      return apiErrorResponse(context, 503, "SERVICE_UNAVAILABLE", "Interaction storage is temporarily unavailable.");
    }
  });
}
