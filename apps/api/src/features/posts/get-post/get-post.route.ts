import { createRoute, type OpenAPIHono } from "@hono/zod-openapi";
import { apiErrorResponse } from "../../../http/api-error";
import type { AuthenticatedApiEnv } from "../../../http/authenticated-actor";
import { createRequireSession, type ResolveSession } from "../../../http/middleware/require-session";
import type { ActorRateLimiter } from "../../../http/middleware/rate-limit";
import { signPostVoiceMemo, signPostMedia, type SignMediaDownload } from "../shared/post-media";
import { getPostErrorResponses, postDetailSchema, postIdParamsSchema } from "../shared/post-detail.contract";
import type { PostDetailRepository } from "../shared/post-detail.repository";

export interface GetPostRouteDependencies {
  /** Resolves the Better Auth cookie or bearer session; never trusts a request-supplied user. */
  resolveSession: ResolveSession;
  repository?: PostDetailRepository;
  /** Absent when media storage isn't configured; a post with media is then a 503. */
  signMediaDownload?: SignMediaDownload;
  now?: () => Date;
  rateLimiter?: ActorRateLimiter;
}

const security: Array<Record<string, string[]>> = [{ BearerAuth: [] }, { cookieAuth: [] }];

const getPostRoute = createRoute({
  method: "get",
  path: "/api/v1/posts/{postId}",
  tags: ["Posts"],
  operationId: "posts.get",
  summary: "Read one post",
  description: "Returns a post the caller may read. Authors can read their own solo and unreleased posts. Anyone else needs a released `friends` post by an active friend with no block in either direction. A missing post and a post the caller may not read both return 404.",
  security,
  request: { params: postIdParamsSchema },
  responses: {
    200: {
      description: "The post.",
      content: { "application/json": { schema: postDetailSchema } },
    },
    ...getPostErrorResponses,
  },
});

export function registerGetPostRoute(app: OpenAPIHono<AuthenticatedApiEnv>, dependencies: GetPostRouteDependencies) {
  app.on("GET", "/api/v1/posts/:postId", createRequireSession(dependencies.resolveSession, dependencies.rateLimiter));
  app.openapi(getPostRoute, async (context) => {
    context.header("Cache-Control", "no-store");
    if (!dependencies.repository) {
      return apiErrorResponse(context, 503, "SERVICE_UNAVAILABLE", "Post storage is temporarily unavailable.");
    }

    const { postId } = context.req.valid("param");
    const now = dependencies.now?.() ?? new Date();
    try {
      const post = await dependencies.repository.findPost(context.get("actor").userId, postId, now);
      if (!post) return apiErrorResponse(context, 404, "NOT_FOUND", "The post was not found.");
      const sign = dependencies.signMediaDownload;
      if ((post.media.length > 0 || post.voiceMemo) && !sign) {
        return apiErrorResponse(context, 503, "SERVICE_UNAVAILABLE", "Media is temporarily unavailable.");
      }
      const media = sign ? await signPostMedia(post.media, sign, now) : [];
      const voiceMemo = sign && post.voiceMemo
        ? await signPostVoiceMemo(post.voiceMemo, sign, now)
        : null;
      return context.json({ ...post, media, voiceMemo }, 200);
    } catch (error) {
      // Never forward SQL or private content to the client.
      console.error("dayli post read failed", error instanceof Error ? error.name : "unknown");
      return apiErrorResponse(context, 503, "SERVICE_UNAVAILABLE", "Post storage is temporarily unavailable.");
    }
  });
}
