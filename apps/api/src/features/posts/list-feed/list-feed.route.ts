import { createRoute, type OpenAPIHono } from "@hono/zod-openapi";
import { apiErrorResponse } from "../../../http/api-error";
import type { AuthenticatedApiEnv } from "../../../http/authenticated-actor";
import { createRequireSession, type ResolveSession } from "../../../http/middleware/require-session";
import { feedPageSchema, feedQuerySchema, listFeedErrorResponses } from "./list-feed.contract";
import { InvalidFeedCursorError, type FeedRepository } from "./list-feed.repository";

export interface ListFeedRouteDependencies {
  /** Resolves the Better Auth cookie or bearer session; never trusts a query-supplied user. */
  resolveSession: ResolveSession;
  repository?: FeedRepository;
  now?: () => Date;
}

const security: Array<Record<string, string[]>> = [{ BearerAuth: [] }, { cookieAuth: [] }];

const listFeedRoute = createRoute({
  method: "get",
  path: "/api/v1/feed",
  tags: ["Posts"],
  operationId: "posts.listFeed",
  summary: "List released posts from friends",
  description: "Returns released `friends` posts by the authenticated user's active friends, newest Auckland day first, including posts released before the friendship began. Solo posts, the caller's own posts, unreleased posts, and posts by blocked or blocking users are never included. Access is re-checked on every page.",
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
  app.use("/api/v1/feed", createRequireSession(dependencies.resolveSession));
  app.openapi(listFeedRoute, async (context) => {
    context.header("Cache-Control", "no-store");
    if (!dependencies.repository) {
      return apiErrorResponse(context, 503, "SERVICE_UNAVAILABLE", "The feed is temporarily unavailable.");
    }

    const { limit, cursor } = context.req.valid("query");
    const now = dependencies.now?.() ?? new Date();
    try {
      const page = await dependencies.repository.listFeed(context.get("actor").userId, now, limit, cursor);
      return context.json(page, 200);
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
