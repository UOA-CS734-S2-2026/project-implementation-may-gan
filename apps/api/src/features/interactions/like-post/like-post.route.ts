import { createRoute, type OpenAPIHono } from "@hono/zod-openapi";
import { apiErrorResponse } from "../../../http/api-error";
import type { AuthenticatedApiEnv } from "../../../http/authenticated-actor";
import { createRequireSession, type ResolveSession } from "../../../http/middleware/require-session";
import type { ActorRateLimiter } from "../../../http/middleware/rate-limit";
import { interactionErrorResponses, interactionPostParamsSchema, postLikeSummarySchema } from "../shared/interactions.contract";
import type { PostLikeRepository } from "../shared/post-like.repository";

export interface LikePostRouteDependencies {
  /** Resolves the Better Auth cookie or bearer session; never trusts a request-supplied user. */
  resolveSession: ResolveSession;
  repository?: PostLikeRepository;
  now?: () => Date;
  rateLimiter?: ActorRateLimiter;
}

const security: Array<Record<string, string[]>> = [{ BearerAuth: [] }, { cookieAuth: [] }];

const likePostRoute = createRoute({
  method: "put",
  path: "/api/v1/posts/{postId}/like",
  tags: ["Interactions"],
  operationId: "interactions.like",
  summary: "Like a post",
  description: "Likes a post the caller may read, including their own. Liking a post already liked changes nothing, so retries are safe. Returns the like count and whether the caller likes it.",
  security,
  request: { params: interactionPostParamsSchema },
  responses: {
    200: {
      description: "The post's like count and whether the caller likes it.",
      content: { "application/json": { schema: postLikeSummarySchema } },
    },
    ...interactionErrorResponses,
  },
});

export function registerLikePostRoute(app: OpenAPIHono<AuthenticatedApiEnv>, dependencies: LikePostRouteDependencies) {
  app.on("PUT", "/api/v1/posts/:postId/like", createRequireSession(dependencies.resolveSession, dependencies.rateLimiter));
  app.openapi(likePostRoute, async (context) => {
    context.header("Cache-Control", "no-store");
    if (!dependencies.repository) {
      return apiErrorResponse(context, 503, "SERVICE_UNAVAILABLE", "Interaction storage is temporarily unavailable.");
    }

    const { postId } = context.req.valid("param");
    const now = dependencies.now?.() ?? new Date();
    try {
      const summary = await dependencies.repository.setLike(context.get("actor").userId, postId, true, now);
      if (!summary) return apiErrorResponse(context, 404, "NOT_FOUND", "The post was not found.");
      return context.json(summary, 200);
    } catch (error) {
      console.error("dayli post like failed", error instanceof Error ? error.name : "unknown");
      return apiErrorResponse(context, 503, "SERVICE_UNAVAILABLE", "Interaction storage is temporarily unavailable.");
    }
  });
}
