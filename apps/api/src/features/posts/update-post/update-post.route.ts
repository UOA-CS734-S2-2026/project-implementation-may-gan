import { createRoute, type OpenAPIHono } from "@hono/zod-openapi";
import { apiErrorResponse } from "../../../http/api-error";
import type { AuthenticatedApiEnv } from "../../../http/authenticated-actor";
import { createRequireSession, type ResolveSession } from "../../../http/middleware/require-session";
import type { ActorRateLimiter } from "../../../http/middleware/rate-limit";
import { postDetailSchema, postIdParamsSchema } from "../shared/post-detail.contract";
import type { PostDetailRepository } from "../shared/post-detail.repository";
import { signPostMedia, signPostVoiceMemo, type SignMediaDownload } from "../shared/post-media";
import { updatePostErrorResponses, updatePostRequestSchema } from "./update-post.contract";
import type { UpdatePostRepository } from "./update-post.repository";

export interface UpdatePostRouteDependencies {
  /** Resolves the Better Auth cookie or bearer session; never trusts a request-supplied user. */
  resolveSession: ResolveSession;
  repository?: UpdatePostRepository;
  /** Reads the saved post back in the same shape as `GET /api/v1/posts/{postId}`. */
  detail?: PostDetailRepository;
  signMediaDownload?: SignMediaDownload;
  now?: () => Date;
  rateLimiter?: ActorRateLimiter;
}

const security: Array<Record<string, string[]>> = [{ BearerAuth: [] }, { cookieAuth: [] }];

const updatePostRoute = createRoute({
  method: "patch",
  path: "/api/v1/posts/{postId}",
  tags: ["Posts"],
  operationId: "posts.update",
  summary: "Edit a post",
  description: "Lets the author change the reflective answer, caption, rating, or audience of their post, before or after release. Each saved edit keeps the previous version as a revision. Send the `revisionCount` you last read as `expectedRevisionCount`; a 409 means another edit was saved first. Repeating an edit that is already saved returns the post without adding a revision.",
  security,
  request: {
    params: postIdParamsSchema,
    body: { required: true, content: { "application/json": { schema: updatePostRequestSchema } } },
  },
  responses: {
    200: {
      description: "The post as it is now.",
      content: { "application/json": { schema: postDetailSchema } },
    },
    ...updatePostErrorResponses,
  },
});

export function registerUpdatePostRoute(app: OpenAPIHono<AuthenticatedApiEnv>, dependencies: UpdatePostRouteDependencies) {
  app.on("PATCH", "/api/v1/posts/:postId", createRequireSession(dependencies.resolveSession, dependencies.rateLimiter));
  app.openapi(updatePostRoute, async (context) => {
    context.header("Cache-Control", "no-store");
    if (!dependencies.repository || !dependencies.detail) {
      return apiErrorResponse(context, 503, "SERVICE_UNAVAILABLE", "Post storage is temporarily unavailable.");
    }

    const { postId } = context.req.valid("param");
    const { expectedRevisionCount, ...changes } = context.req.valid("json");
    const authorId = context.get("actor").userId;
    const now = dependencies.now?.() ?? new Date();
    try {
      const outcome = await dependencies.repository.updatePost(authorId, postId, expectedRevisionCount, changes, now);
      if (outcome === "not_found") return apiErrorResponse(context, 404, "NOT_FOUND", "The post was not found.");
      if (outcome === "conflict") {
        return apiErrorResponse(context, 409, "CONFLICT", "The post was edited since you last read it.");
      }

      const post = await dependencies.detail.findPost(authorId, postId, now);
      if (!post) return apiErrorResponse(context, 404, "NOT_FOUND", "The post was not found.");
      const sign = dependencies.signMediaDownload;
      if ((post.media.length > 0 || post.voiceMemo) && !sign) {
        return apiErrorResponse(context, 503, "SERVICE_UNAVAILABLE", "Media is temporarily unavailable.");
      }
      const media = sign ? await signPostMedia(post.media, sign, now) : [];
      const voiceMemo = sign && post.voiceMemo ? await signPostVoiceMemo(post.voiceMemo, sign, now) : null;
      return context.json({ ...post, media, voiceMemo }, 200);
    } catch (error) {
      // Never forward SQL or private content to the client.
      console.error("dayli post edit failed", error instanceof Error ? error.name : "unknown");
      return apiErrorResponse(context, 503, "SERVICE_UNAVAILABLE", "Post storage is temporarily unavailable.");
    }
  });
}
