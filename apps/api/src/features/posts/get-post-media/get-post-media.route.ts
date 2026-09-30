import { createRoute, type OpenAPIHono } from "@hono/zod-openapi";
import { apiErrorResponse } from "../../../http/api-error";
import type { AuthenticatedApiEnv } from "../../../http/authenticated-actor";
import { createRequireSession, type ResolveSession } from "../../../http/middleware/require-session";
import type { ActorRateLimiter } from "../../../http/middleware/rate-limit";
import { postMediaSchema } from "../shared/post-media.contract";
import { signPostMedia, type SignMediaDownload } from "../shared/post-media";
import { getPostMediaErrorResponses, postMediaParamsSchema } from "./get-post-media.contract";
import type { PostMediaRepository } from "./get-post-media.repository";

export interface GetPostMediaRouteDependencies {
  /** Resolves the Better Auth cookie or bearer session; never trusts a request-supplied user. */
  resolveSession: ResolveSession;
  repository?: PostMediaRepository;
  signMediaDownload?: SignMediaDownload;
  now?: () => Date;
  rateLimiter?: ActorRateLimiter;
}

const security: Array<Record<string, string[]>> = [{ BearerAuth: [] }, { cookieAuth: [] }];

const getPostMediaRoute = createRoute({
  method: "get",
  path: "/api/v1/posts/{postId}/media/{mediaId}",
  tags: ["Posts"],
  operationId: "posts.getMedia",
  summary: "Get a fresh download URL for one attached photo or video",
  description: "Returns a new private download URL, valid for 5 minutes, when an earlier one has expired. "
    + "The same rules as reading the post apply, and the media must still be attached to it.",
  security,
  request: { params: postMediaParamsSchema },
  responses: {
    200: {
      description: "The media with a fresh download URL.",
      content: { "application/json": { schema: postMediaSchema } },
    },
    ...getPostMediaErrorResponses,
  },
});

export function registerGetPostMediaRoute(
  app: OpenAPIHono<AuthenticatedApiEnv>,
  dependencies: GetPostMediaRouteDependencies,
) {
  app.use("/api/v1/posts/:postId/media/:mediaId", createRequireSession(dependencies.resolveSession, dependencies.rateLimiter));
  app.openapi(getPostMediaRoute, async (context) => {
    context.header("Cache-Control", "no-store");
    if (!dependencies.repository || !dependencies.signMediaDownload) {
      return apiErrorResponse(context, 503, "SERVICE_UNAVAILABLE", "Media is temporarily unavailable.");
    }

    const { postId, mediaId } = context.req.valid("param");
    const now = dependencies.now?.() ?? new Date();
    try {
      const media = await dependencies.repository.findMedia(context.get("actor").userId, postId, mediaId, now);
      if (!media) return apiErrorResponse(context, 404, "NOT_FOUND", "The media was not found.");
      const [signed] = await signPostMedia([media], dependencies.signMediaDownload, now);
      return context.json(signed!, 200);
    } catch (error) {
      // Never forward SQL, object keys, or signed URLs to the client or logs.
      console.error("dayli post media read failed", error instanceof Error ? error.name : "unknown");
      return apiErrorResponse(context, 503, "SERVICE_UNAVAILABLE", "Media is temporarily unavailable.");
    }
  });
}
