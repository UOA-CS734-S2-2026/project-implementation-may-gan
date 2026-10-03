import { createRoute, type OpenAPIHono } from "@hono/zod-openapi";
import { apiErrorResponse } from "../../../http/api-error";
import type { AuthenticatedApiEnv } from "../../../http/authenticated-actor";
import { createRequireSession, type ResolveSession } from "../../../http/middleware/require-session";
import type { ActorRateLimiter } from "../../../http/middleware/rate-limit";
import { postVoiceMemoSchema } from "../shared/post-media.contract";
import { signPostVoiceMemo, type SignMediaDownload } from "../shared/post-media";
import {
  getPostVoiceMemoErrorResponses,
  postVoiceMemoParamsSchema,
} from "./get-post-voice-memo.contract";
import type { PostVoiceMemoRepository } from "./get-post-voice-memo.repository";

export interface GetPostVoiceMemoRouteDependencies {
  /** Resolves the Better Auth cookie or bearer session; never trusts a request-supplied user. */
  resolveSession: ResolveSession;
  repository?: PostVoiceMemoRepository;
  signMediaDownload?: SignMediaDownload;
  now?: () => Date;
  rateLimiter?: ActorRateLimiter;
}

const security: Array<Record<string, string[]>> = [{ BearerAuth: [] }, { cookieAuth: [] }];

const getPostVoiceMemoRoute = createRoute({
  method: "get",
  path: "/api/v1/posts/{postId}/voice-memo",
  tags: ["Posts"],
  operationId: "posts.getVoiceMemo",
  summary: "Get a fresh download URL for a post's voice memo",
  description: "Returns a new private download URL, valid for 5 minutes, when an earlier one has expired. "
    + "The same rules as reading the post apply, and the voice memo must still be attached to it.",
  security,
  request: { params: postVoiceMemoParamsSchema },
  responses: {
    200: {
      description: "The voice memo with a fresh download URL.",
      content: { "application/json": { schema: postVoiceMemoSchema } },
    },
    ...getPostVoiceMemoErrorResponses,
  },
});

export function registerGetPostVoiceMemoRoute(
  app: OpenAPIHono<AuthenticatedApiEnv>,
  dependencies: GetPostVoiceMemoRouteDependencies,
) {
  app.use("/api/v1/posts/:postId/voice-memo", createRequireSession(dependencies.resolveSession, dependencies.rateLimiter));
  app.openapi(getPostVoiceMemoRoute, async (context) => {
    context.header("Cache-Control", "no-store");
    if (!dependencies.repository || !dependencies.signMediaDownload) {
      return apiErrorResponse(context, 503, "SERVICE_UNAVAILABLE", "Media is temporarily unavailable.");
    }

    const { postId } = context.req.valid("param");
    const now = dependencies.now?.() ?? new Date();
    try {
      const voiceMemo = await dependencies.repository.findVoiceMemo(context.get("actor").userId, postId, now);
      if (!voiceMemo) return apiErrorResponse(context, 404, "NOT_FOUND", "The voice memo was not found.");
      return context.json(await signPostVoiceMemo(voiceMemo, dependencies.signMediaDownload, now), 200);
    } catch (error) {
      // Never forward SQL, object keys, or signed URLs to the client or logs.
      console.error("dayli post voice memo read failed", error instanceof Error ? error.name : "unknown");
      return apiErrorResponse(context, 503, "SERVICE_UNAVAILABLE", "Media is temporarily unavailable.");
    }
  });
}
