import { createRoute, type OpenAPIHono } from "@hono/zod-openapi";
import { apiErrorResponse } from "../../../http/api-error";
import type { AuthenticatedApiEnv } from "../../../http/authenticated-actor";
import { createRequireSession, type ResolveSession } from "../../../http/middleware/require-session";
import type { ActorRateLimiter } from "../../../http/middleware/rate-limit";
import { commentErrorResponses, commentParamsSchema, postCommentSchema } from "../shared/interactions.contract";
import { updatePostCommentRequestSchema } from "./update-post-comment.contract";
import type { UpdatePostCommentRepository } from "./update-post-comment.repository";

export interface UpdatePostCommentRouteDependencies {
  /** Resolves the Better Auth cookie or bearer session; never trusts a request-supplied user. */
  resolveSession: ResolveSession;
  repository?: UpdatePostCommentRepository;
  now?: () => Date;
  rateLimiter?: ActorRateLimiter;
}

const security: Array<Record<string, string[]>> = [{ BearerAuth: [] }, { cookieAuth: [] }];

const updatePostCommentRoute = createRoute({
  method: "patch",
  path: "/api/v1/posts/{postId}/comments/{commentId}",
  tags: ["Interactions"],
  operationId: "interactions.updateComment",
  summary: "Edit a comment",
  description: "Lets the commenter change their comment while they can still read the post. The comment is then marked edited. Anyone else's comment returns 404.",
  security,
  request: {
    params: commentParamsSchema,
    body: { required: true, content: { "application/json": { schema: updatePostCommentRequestSchema } } },
  },
  responses: {
    200: {
      description: "The comment as it is now.",
      content: { "application/json": { schema: postCommentSchema } },
    },
    ...commentErrorResponses,
  },
});

export function registerUpdatePostCommentRoute(app: OpenAPIHono<AuthenticatedApiEnv>, dependencies: UpdatePostCommentRouteDependencies) {
  app.on("PATCH", "/api/v1/posts/:postId/comments/:commentId", createRequireSession(dependencies.resolveSession, dependencies.rateLimiter));
  app.openapi(updatePostCommentRoute, async (context) => {
    context.header("Cache-Control", "no-store");
    if (!dependencies.repository) {
      return apiErrorResponse(context, 503, "SERVICE_UNAVAILABLE", "Interaction storage is temporarily unavailable.");
    }

    const { postId, commentId } = context.req.valid("param");
    const { text } = context.req.valid("json");
    const now = dependencies.now?.() ?? new Date();
    try {
      const comment = await dependencies.repository.updateComment(context.get("actor").userId, postId, commentId, text, now);
      if (!comment) return apiErrorResponse(context, 404, "NOT_FOUND", "The comment was not found.");
      return context.json(comment, 200);
    } catch (error) {
      console.error("dayli comment edit failed", error instanceof Error ? error.name : "unknown");
      return apiErrorResponse(context, 503, "SERVICE_UNAVAILABLE", "Interaction storage is temporarily unavailable.");
    }
  });
}
