import { createRoute, type OpenAPIHono } from "@hono/zod-openapi";
import { apiErrorResponse } from "../../../http/api-error";
import type { AuthenticatedApiEnv } from "../../../http/authenticated-actor";
import { createRequireSession, type ResolveSession } from "../../../http/middleware/require-session";
import type { ActorRateLimiter } from "../../../http/middleware/rate-limit";
import { signPostMedia, type SignMediaDownload } from "../shared/post-media";
import { feedPageSchema, feedQuerySchema, listFeedErrorResponses } from "./list-feed.contract";
import { InvalidFeedCursorError, type FeedRepository } from "./list-feed.repository";

export interface ListFeedRouteDependencies {
  /** Resolves the Better Auth cookie or bearer session; never trusts a query-supplied user. */
  resolveSession: ResolveSession;
  repository?: FeedRepository;
  /** Absent when media storage isn't configured; a page with media is then a 503. */
  signMediaDownload?: SignMediaDownload;
  now?: () => Date;
  rateLimiter?: ActorRateLimiter;
}

const security: Array<Record<string, string[]>> = [{ BearerAuth: [] }, { cookieAuth: [] }];

const listFeedRoute = createRoute({
  method: "get",
  path: "/api/v1/feed",
  tags: ["Posts"],
  operationId: "posts.listFeed",
  summary: "List yesterday's posts from friends",
  description: "Returns yesterday's `friends` posts by the authenticated user's active friends: the Auckland day released at the most recent midnight. Earlier days are on each friend's profile. Solo posts, the caller's own posts, and posts by blocked or blocking users are never included. Access is re-checked on every page.",
  security,
  request: { query: feedQuerySchema },
  responses: {
    200: {
      description: "One page of the feed.",
      content: { "application/json": { schema: feedPageSchema } },
    },
    ...listFeedErrorResponses,
  },
});

export function registerListFeedRoute(app: OpenAPIHono<AuthenticatedApiEnv>, dependencies: ListFeedRouteDependencies) {
  app.use("/api/v1/feed", createRequireSession(dependencies.resolveSession, dependencies.rateLimiter));
  app.openapi(listFeedRoute, async (context) => {
    context.header("Cache-Control", "no-store");
    if (!dependencies.repository) {
      return apiErrorResponse(context, 503, "SERVICE_UNAVAILABLE", "The feed is temporarily unavailable.");
    }

    const { limit, cursor } = context.req.valid("query");
    const now = dependencies.now?.() ?? new Date();
    try {
      const page = await dependencies.repository.listFeed(context.get("actor").userId, now, limit, cursor);
      const sign = dependencies.signMediaDownload;
      if (page.items.some((item) => item.media.length > 0) && !sign) {
        return apiErrorResponse(context, 503, "SERVICE_UNAVAILABLE", "Media is temporarily unavailable.");
      }
      const items = await Promise.all(page.items.map(async (item) => ({
        ...item,
        media: sign ? await signPostMedia(item.media, sign, now) : [],
      })));
      return context.json({ ...page, items }, 200);
    } catch (error) {
      if (error instanceof InvalidFeedCursorError) {
        return apiErrorResponse(context, 422, "VALIDATION_FAILED", "The request contains invalid values.", { field: "cursor" });
      }
      // Never forward SQL or private content to the client.
      console.error("dayli feed read failed", error instanceof Error ? error.name : "unknown");
      return apiErrorResponse(context, 503, "SERVICE_UNAVAILABLE", "The feed is temporarily unavailable.");
    }
  });
}
