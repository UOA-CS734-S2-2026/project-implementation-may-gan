import { createRoute, type OpenAPIHono } from "@hono/zod-openapi";
import { apiErrorResponse } from "../../../http/api-error";
import type { AuthenticatedApiEnv } from "../../../http/authenticated-actor";
import { createRequireSession, type ResolveSession } from "../../../http/middleware/require-session";
import { createRequireUsername, type HasUsername } from "../../../http/middleware/require-username";
import { commentErrorResponses, commentParamsSchema, USERNAME_REQUIRED } from "../shared/interactions.contract";
import type { ActorRateLimiter } from "../../../http/middleware/rate-limit";
import type { DeletePostCommentRepository } from "./delete-post-comment.repository";

export interface DeletePostCommentRouteDependencies {
  /** Resolves the Better Auth cookie or bearer session; never trusts a request-supplied user. */
  resolveSession: ResolveSession;
  /** Likes and comments need a public username, like messaging. */
  hasUsername?: HasUsername;
  repository?: DeletePostCommentRepository;
  now?: () => Date;
  rateLimiter?: ActorRateLimiter;
}

const security: Array<Record<string, string[]>> = [{ BearerAuth: [] }, { cookieAuth: [] }];

const deletePostCommentRoute = createRoute({
  method: "delete",
  path: "/api/v1/posts/{postId}/comments/{commentId}",
  tags: ["Interactions"],
  operationId: "interactions.deleteComment",
  summary: "Delete a comment",
  description: "Lets the commenter, or the post's author, delete a comment. Deleting a top-level comment also hides its replies. Deleting a comment that is already deleted also returns 204.",
  security,
  request: { params: commentParamsSchema },
  responses: {
    204: { description: "The comment is deleted." },
    ...commentErrorResponses,
  },
});

export function registerDeletePostCommentRoute(app: OpenAPIHono<AuthenticatedApiEnv>, dependencies: DeletePostCommentRouteDependencies) {
  app.on("DELETE", "/api/v1/posts/:postId/comments/:commentId", createRequireSession(dependencies.resolveSession, dependencies.rateLimiter));
  app.on("DELETE", "/api/v1/posts/:postId/comments/:commentId", createRequireUsername(dependencies.hasUsername, USERNAME_REQUIRED));
  app.openapi(deletePostCommentRoute, async (context) => {
    context.header("Cache-Control", "no-store");
    if (!dependencies.repository) {
      return apiErrorResponse(context, 503, "SERVICE_UNAVAILABLE", "Interaction storage is temporarily unavailable.");
    }

    const { postId, commentId } = context.req.valid("param");
    const now = dependencies.now?.() ?? new Date();
    try {
      const deleted = await dependencies.repository.deleteComment(context.get("actor").userId, postId, commentId, now);
      if (!deleted) return apiErrorResponse(context, 404, "NOT_FOUND", "The comment was not found.");
      return context.body(null, 204);
    } catch (error) {
      console.error("dayli comment delete failed", error instanceof Error ? error.name : "unknown");
      return apiErrorResponse(context, 503, "SERVICE_UNAVAILABLE", "Interaction storage is temporarily unavailable.");
    }
  });
}
