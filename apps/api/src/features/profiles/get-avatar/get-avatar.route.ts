import { createRoute, z, type OpenAPIHono } from "@hono/zod-openapi";
import { apiErrorSchema } from "@dayli/contracts";
import { apiErrorResponse } from "../../../http/api-error";
import type { OptionalAuthenticatedApiEnv } from "../../../http/authenticated-actor";
import { createOptionalSession, type ResolveSession } from "../../../http/middleware/require-session";
import type { ActorRateLimiter } from "../../../http/middleware/rate-limit";
import type { MediaObjectStore } from "../../../infrastructure/media/r2";
import { authorizedMediaResponse } from "../../../infrastructure/media/authorized-media-response";
import type { AvatarContentRepository } from "../shared/avatar-content.repository";

export interface GetAvatarRouteDependencies {
  resolveSession: ResolveSession;
  repository?: AvatarContentRepository;
  objects?: MediaObjectStore;
  now?: () => Date;
  rateLimiter?: ActorRateLimiter;
}

const paramsSchema = z.object({
  username: z.string().trim().min(2).max(32).regex(/^[a-zA-Z0-9_]+$/)
    .openapi({ param: { name: "username", in: "path" } }),
});
const error = (description: string) => ({ description, content: { "application/json": { schema: apiErrorSchema } } });
const route = createRoute({
  method: "get",
  path: "/api/v1/profiles/{username}/avatar",
  tags: ["Profile"],
  operationId: "profile.getAvatar",
  summary: "Read a currently authorized profile avatar",
  description: "Rechecks current profile visibility and blocks on every request, then streams the private object without exposing a provider URL or object key.",
  security: [{}, { BearerAuth: [] }, { cookieAuth: [] }],
  request: { params: paramsSchema },
  responses: {
    200: { description: "The avatar bytes.", content: { "application/octet-stream": { schema: z.string().openapi({ format: "binary" }) } } },
    206: { description: "The requested avatar byte range.", content: { "application/octet-stream": { schema: z.string().openapi({ format: "binary" }) } } },
    304: { description: "The authorized representation has not changed." },
    401: error("Presented credentials are invalid."),
    404: error("The avatar is absent or its current profile is not readable."),
    412: { description: "An authorized conditional request precondition failed. The response has no provider body." },
    416: { description: "The requested byte range is not satisfiable. The response has no provider body." },
    429: error("Rate limit reached."),
    503: error("Avatar media is temporarily unavailable."),
  },
});

export function registerGetAvatarRoute(
  app: OpenAPIHono<OptionalAuthenticatedApiEnv>,
  dependencies: GetAvatarRouteDependencies,
) {
  app.use("/api/v1/profiles/:username/avatar", createOptionalSession(dependencies.resolveSession, dependencies.rateLimiter));
  app.openapi(route, async (context) => {
    context.header("Cache-Control", "no-store");
    if (!dependencies.repository || !dependencies.objects) {
      return apiErrorResponse(context, 503, "SERVICE_UNAVAILABLE", "Avatar media is temporarily unavailable.");
    }
    try {
      const avatar = await dependencies.repository.findAvatar(
        context.get("actor")?.userId ?? null,
        (context.req.valid as (target: "param") => z.infer<typeof paramsSchema>)("param").username,
        dependencies.now?.() ?? new Date(),
      );
      if (!avatar) return apiErrorResponse(context, 404, "NOT_FOUND", "The avatar was not found.");
      return await authorizedMediaResponse(context, dependencies.objects, avatar.objectKey);
    } catch (error) {
      console.error("dayli authorized avatar read failed", error instanceof Error ? error.name : "unknown");
      return apiErrorResponse(context, 503, "SERVICE_UNAVAILABLE", "Avatar media is temporarily unavailable.");
    }
  });
}
