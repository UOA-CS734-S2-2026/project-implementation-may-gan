import { createRoute, type OpenAPIHono } from "@hono/zod-openapi";
import { apiErrorResponse } from "../../../http/api-error";
import type { AuthenticatedApiEnv } from "../../../http/authenticated-actor";
import { createRequireSession, type ResolveSession } from "../../../http/middleware/require-session";
import type { ActorRateLimiter } from "../../../http/middleware/rate-limit";
import { interactionPostParamsSchema, postCommentSchema } from "../shared/interactions.contract";
import { createPostCommentErrorResponses, createPostCommentRequestSchema } from "./create-post-comment.contract";
import type { CreatePostCommentRepository } from "./create-post-comment.repository";

export interface CreatePostCommentRouteDependencies {
  /** Resolves the Better Auth cookie or bearer session; never trusts a request-supplied user. */
  resolveSession: ResolveSession;
  repository?: CreatePostCommentRepository;
  now?: () => Date;
  rateLimiter?: ActorRateLimiter;
}

const security: Array<Record<string, string[]>> = [{ BearerAuth: [] }, { cookieAuth: [] }];

const createPostCommentRoute = createRoute({
  method: "post",
  path: "/api/v1/posts/{postId}/comments",
  tags: ["Interactions"],
  operationId: "interactions.createComment",
  summary: "Comment on a post",
  description: "Adds a comment, or a reply to a top-level comment, on a post the caller may read. Replies go one level deep. A retry with the same `clientCommentId` returns the comment already made with 200.",
  security,
  request: {
    params: interactionPostParamsSchema,
    body: { required: true, content: { "application/json": { schema: createPostCommentRequestSchema } } },
  },
  responses: {
    200: {
      description: "A retry of a comment already made.",
      content: { "application/json": { schema: postCommentSchema } },
    },
    201: {
      description: "The new comment.",
      content: { "application/json": { schema: postCommentSchema } },
    },
    ...createPostCommentErrorResponses,
  },
});

export function registerCreatePostCommentRoute(app: OpenAPIHono<AuthenticatedApiEnv>, dependencies: CreatePostCommentRouteDependencies) {
  app.on("POST", "/api/v1/posts/:postId/comments", createRequireSession(dependencies.resolveSession, dependencies.rateLimiter));
  app.openapi(createPostCommentRoute, async (context) => {
    context.header("Cache-Control", "no-store");
    if (!dependencies.repository) {
      return apiErrorResponse(context, 503, "SERVICE_UNAVAILABLE", "Interaction storage is temporarily unavailable.");
    }

    const { postId } = context.req.valid("param");
    const request = context.req.valid("json");
    const now = dependencies.now?.() ?? new Date();
    try {
      const outcome = await dependencies.repository.createComment(context.get("actor").userId, postId, request, now);
      switch (outcome.kind) {
        case "created":
          return context.json(outcome.comment, 201);
        case "replayed":
          return context.json(outcome.comment, 200);
        case "not_found":
          return apiErrorResponse(context, 404, "NOT_FOUND", "The post was not found.");
        case "invalid_parent":
          return apiErrorResponse(context, 422, "VALIDATION_FAILED", "The request contains invalid values.", { field: "parentCommentId" });
        case "conflict":
          return apiErrorResponse(context, 409, "CONFLICT", "That comment ID was already used for a different comment.");
      }
    } catch (error) {
      console.error("dayli comment create failed", error instanceof Error ? error.name : "unknown");
      return apiErrorResponse(context, 503, "SERVICE_UNAVAILABLE", "Interaction storage is temporarily unavailable.");
    }
  });
}
