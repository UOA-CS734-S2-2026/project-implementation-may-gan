import { createRoute, type OpenAPIHono } from "@hono/zod-openapi";
import { apiErrorResponse } from "../../../http/api-error";
import type { AuthenticatedApiEnv } from "../../../http/authenticated-actor";
import { createRequireSession, type ResolveSession } from "../../../http/middleware/require-session";
import type { ActorRateLimiter } from "../../../http/middleware/rate-limit";
import { interactionErrorResponses, interactionPostParamsSchema, postLikeSummarySchema } from "../shared/interactions.contract";
import type { PostLikeRepository } from "../shared/post-like.repository";

export interface UnlikePostRouteDependencies {
  /** Resolves the Better Auth cookie or bearer session; never trusts a request-supplied user. */
  resolveSession: ResolveSession;
  repository?: PostLikeRepository;
  now?: () => Date;
  rateLimiter?: ActorRateLimiter;
}

const security: Array<Record<string, string[]>> = [{ BearerAuth: [] }, { cookieAuth: [] }];

const unlikePostRoute = createRoute({
  method: "delete",
  path: "/api/v1/posts/{postId}/like",
  tags: ["Interactions"],
  operationId: "interactions.unlike",
  summary: "Unlike a post",
  description: "Removes the caller's like from a post they may read. Unliking a post that isn't liked changes nothing, so retries are safe. Returns the like count and whether the caller likes it.",
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

export function registerUnlikePostRoute(app: OpenAPIHono<AuthenticatedApiEnv>, dependencies: UnlikePostRouteDependencies) {
  app.on("DELETE", "/api/v1/posts/:postId/like", createRequireSession(dependencies.resolveSession, dependencies.rateLimiter));
  app.openapi(unlikePostRoute, async (context) => {
    context.header("Cache-Control", "no-store");
    if (!dependencies.repository) {
      return apiErrorResponse(context, 503, "SERVICE_UNAVAILABLE", "Interaction storage is temporarily unavailable.");
    }

    const { postId } = context.req.valid("param");
    const now = dependencies.now?.() ?? new Date();
    try {
      const summary = await dependencies.repository.setLike(context.get("actor").userId, postId, false, now);
      if (!summary) return apiErrorResponse(context, 404, "NOT_FOUND", "The post was not found.");
      return context.json(summary, 200);
    } catch (error) {
      console.error("dayli post unlike failed", error instanceof Error ? error.name : "unknown");
      return apiErrorResponse(context, 503, "SERVICE_UNAVAILABLE", "Interaction storage is temporarily unavailable.");
    }
  });
}
