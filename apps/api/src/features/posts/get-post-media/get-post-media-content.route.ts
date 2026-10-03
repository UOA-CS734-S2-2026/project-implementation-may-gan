import { createRoute, z, type OpenAPIHono } from "@hono/zod-openapi";
import { apiErrorSchema } from "@dayli/contracts";
import { apiErrorResponse } from "../../../http/api-error";
import type { OptionalAuthenticatedApiEnv } from "../../../http/authenticated-actor";
import { createOptionalSession, type ResolveSession } from "../../../http/middleware/require-session";
import type { ActorRateLimiter } from "../../../http/middleware/rate-limit";
import type { MediaObjectStore } from "../../../infrastructure/media/r2";
import { authorizedMediaResponse } from "../../../infrastructure/media/authorized-media-response";
import { postMediaParamsSchema } from "./get-post-media.contract";
import type { PostMediaRepository } from "./get-post-media.repository";

export interface GetPostMediaContentRouteDependencies {
  resolveSession: ResolveSession;
  repository?: PostMediaRepository;
  objects?: MediaObjectStore;
  now?: () => Date;
  rateLimiter?: ActorRateLimiter;
}

const security: Array<Record<string, string[]>> = [{}, { BearerAuth: [] }, { cookieAuth: [] }];
const error = (description: string) => ({ description, content: { "application/json": { schema: apiErrorSchema } } });

const route = createRoute({
  method: "get",
  path: "/api/v1/posts/{postId}/media/{mediaId}/content",
  tags: ["Posts"],
  operationId: "posts.getMediaContent",
  summary: "Read currently authorized post media bytes",
  description: "Rechecks the current post and attachment on every request, then streams the private object without exposing a provider URL or object key.",
  security,
  request: { params: postMediaParamsSchema },
  responses: {
    200: { description: "The media bytes.", content: { "application/octet-stream": { schema: z.string().openapi({ format: "binary" }) } } },
    206: { description: "The requested media byte range.", content: { "application/octet-stream": { schema: z.string().openapi({ format: "binary" }) } } },
    304: { description: "The authorized representation has not changed." },
    401: error("Presented credentials are invalid."),
    404: error("The media is absent, detached, or its current parent is not readable."),
    416: { description: "The requested byte range is not satisfiable." },
    429: error("Rate limit reached."),
    503: error("Media is temporarily unavailable."),
  },
});

export function registerGetPostMediaContentRoute(
  app: OpenAPIHono<OptionalAuthenticatedApiEnv>,
  dependencies: GetPostMediaContentRouteDependencies,
) {
  const path = "/api/v1/posts/:postId/media/:mediaId/content";
  app.use(path, createOptionalSession(dependencies.resolveSession, dependencies.rateLimiter));
  app.openapi(route, async (context) => {
    context.header("Cache-Control", "no-store");
    if (!dependencies.repository || !dependencies.objects) {
      return apiErrorResponse(context, 503, "SERVICE_UNAVAILABLE", "Media is temporarily unavailable.");
    }
    const { postId, mediaId } = context.req.valid("param");
    try {
      const media = await dependencies.repository.findMedia(
        context.get("actor")?.userId ?? null,
        postId,
        mediaId,
        dependencies.now?.() ?? new Date(),
        "parent-authorized",
      );
      if (!media) return apiErrorResponse(context, 404, "NOT_FOUND", "The media was not found.");
      return await authorizedMediaResponse(context, dependencies.objects, media.objectKey);
    } catch (error) {
      console.error("dayli authorized post media read failed", error instanceof Error ? error.name : "unknown");
      return apiErrorResponse(context, 503, "SERVICE_UNAVAILABLE", "Media is temporarily unavailable.");
    }
  });
}
