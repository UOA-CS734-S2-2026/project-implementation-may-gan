import { createRoute, type OpenAPIHono } from "@hono/zod-openapi";
import { apiErrorResponse } from "../../../http/api-error";
import type { AuthenticatedApiEnv } from "../../../http/authenticated-actor";
import { createRequireSession, type ResolveSession } from "../../../http/middleware/require-session";
import type { ActorRateLimiter } from "../../../http/middleware/rate-limit";
import { signPostMedia, type SignMediaDownload } from "../shared/post-media";
import { InvalidPostCursorError } from "../shared/post-page-cursor";
import {
  listProfilePostsErrorResponses,
  profilePostsPageSchema,
  profilePostsParamsSchema,
  profilePostsQuerySchema,
} from "./list-profile-posts.contract";
import type { ProfilePostsRepository } from "./list-profile-posts.repository";

export interface ListProfilePostsRouteDependencies {
  /** Resolves the Better Auth cookie or bearer session; never trusts a request-supplied user. */
  resolveSession: ResolveSession;
  repository?: ProfilePostsRepository;
  now?: () => Date;
  rateLimiter?: ActorRateLimiter;
  /** Absent when media storage isn't configured; a page with media is then a 503. */
  signMediaDownload?: SignMediaDownload;
}

const security: Array<Record<string, string[]>> = [{ BearerAuth: [] }, { cookieAuth: [] }];

const listProfilePostsRoute = createRoute({
  method: "get",
  path: "/api/v1/profiles/{username}/posts",
  tags: ["Posts"],
  operationId: "posts.listProfilePosts",
  summary: "List the posts on a profile",
  description: "Returns one person's posts, newest Auckland day first. On the caller's own profile this includes solo and unreleased posts. On anyone else's it includes only released `friends` posts, and only while the two are active friends; otherwise the page is empty. Access is re-checked on every page. Unknown, banned and blocked profiles all return 404.",
  security,
  request: { params: profilePostsParamsSchema, query: profilePostsQuerySchema },
  responses: {
    200: {
      description: "One page of the profile's posts.",
      content: { "application/json": { schema: profilePostsPageSchema } },
    },
    ...listProfilePostsErrorResponses,
  },
});

export function registerListProfilePostsRoute(app: OpenAPIHono<AuthenticatedApiEnv>, dependencies: ListProfilePostsRouteDependencies) {
  app.use("/api/v1/profiles/:username/posts", createRequireSession(dependencies.resolveSession, dependencies.rateLimiter));
  app.openapi(listProfilePostsRoute, async (context) => {
    context.header("Cache-Control", "no-store");
    if (!dependencies.repository) {
      return apiErrorResponse(context, 503, "SERVICE_UNAVAILABLE", "Post storage is temporarily unavailable.");
    }

    const { username } = context.req.valid("param");
    const { limit, cursor } = context.req.valid("query");
    const now = dependencies.now?.() ?? new Date();
    try {
      const page = await dependencies.repository.listProfilePosts(context.get("actor").userId, username, now, limit, cursor);
      if (!page) return apiErrorResponse(context, 404, "NOT_FOUND", "The profile was not found.");
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
      if (error instanceof InvalidPostCursorError) {
        return apiErrorResponse(context, 422, "VALIDATION_FAILED", "The request contains invalid values.", { field: "cursor" });
      }
      // Never forward SQL or private content to the client.
      console.error("dayli profile posts read failed", error instanceof Error ? error.name : "unknown");
      return apiErrorResponse(context, 503, "SERVICE_UNAVAILABLE", "Post storage is temporarily unavailable.");
    }
  });
}
