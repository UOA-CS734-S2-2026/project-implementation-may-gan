import { createRoute, z, type OpenAPIHono } from "@hono/zod-openapi";
import { apiErrorSchema, opaqueIdSchema } from "@dayli/contracts";
import { apiErrorResponse } from "../../../http/api-error";
import type { OptionalAuthenticatedApiEnv } from "../../../http/authenticated-actor";
import { createOptionalSession, type ResolveSession } from "../../../http/middleware/require-session";
import type { ActorRateLimiter } from "../../../http/middleware/rate-limit";
import type { MediaObjectStore } from "../../../infrastructure/media/r2";
import { authorizedMediaResponse } from "../../../infrastructure/media/authorized-media-response";
import type { PostVoiceMemoRepository } from "./get-post-voice-memo.repository";

export interface GetPostVoiceMemoContentRouteDependencies {
  resolveSession: ResolveSession;
  repository?: PostVoiceMemoRepository;
  objects?: MediaObjectStore;
  now?: () => Date;
  rateLimiter?: ActorRateLimiter;
}

const paramsSchema = z.object({ postId: opaqueIdSchema.openapi({ param: { name: "postId", in: "path" }, example: "post-1" }) });
const error = (description: string) => ({ description, content: { "application/json": { schema: apiErrorSchema } } });
const route = createRoute({
  method: "get",
  path: "/api/v1/posts/{postId}/voice-memo/content",
  tags: ["Posts"],
  operationId: "posts.getVoiceMemoContent",
  summary: "Read currently authorized voice memo bytes",
  description: "Rechecks the current post and attachment on every request, then streams the private object without exposing a provider URL or object key.",
  security: [{}, { BearerAuth: [] }, { cookieAuth: [] }],
  request: { params: paramsSchema },
  responses: {
    200: { description: "The voice memo bytes.", content: { "application/octet-stream": { schema: z.string().openapi({ format: "binary" }) } } },
    206: { description: "The requested voice memo byte range.", content: { "application/octet-stream": { schema: z.string().openapi({ format: "binary" }) } } },
    304: { description: "The authorized representation has not changed." },
    401: error("Presented credentials are invalid."),
    404: error("The voice memo is absent, detached, or its current parent is not readable."),
    416: { description: "The requested byte range is not satisfiable." },
    429: error("Rate limit reached."),
    503: error("Media is temporarily unavailable."),
  },
});

export function registerGetPostVoiceMemoContentRoute(
  app: OpenAPIHono<OptionalAuthenticatedApiEnv>,
  dependencies: GetPostVoiceMemoContentRouteDependencies,
) {
  app.use("/api/v1/posts/:postId/voice-memo/content", createOptionalSession(dependencies.resolveSession, dependencies.rateLimiter));
  app.openapi(route, async (context) => {
    context.header("Cache-Control", "no-store");
    if (!dependencies.repository || !dependencies.objects) {
      return apiErrorResponse(context, 503, "SERVICE_UNAVAILABLE", "Media is temporarily unavailable.");
    }
    try {
      const media = await dependencies.repository.findVoiceMemo(
        context.get("actor")?.userId ?? null,
        (context.req.valid as (target: "param") => z.infer<typeof paramsSchema>)("param").postId,
        dependencies.now?.() ?? new Date(),
        "parent-authorized",
      );
      if (!media) return apiErrorResponse(context, 404, "NOT_FOUND", "The voice memo was not found.");
      return await authorizedMediaResponse(context, dependencies.objects, media.objectKey);
    } catch (error) {
      console.error("dayli authorized voice memo read failed", error instanceof Error ? error.name : "unknown");
      return apiErrorResponse(context, 503, "SERVICE_UNAVAILABLE", "Media is temporarily unavailable.");
    }
  });
}
