import { createRoute, type OpenAPIHono } from "@hono/zod-openapi";
import { apiErrorResponse } from "../../../http/api-error";
import type { OptionalAuthenticatedApiEnv } from "../../../http/authenticated-actor";
import { createOptionalSession, type ResolveSession } from "../../../http/middleware/require-session";
import type { ActorRateLimiter } from "../../../http/middleware/rate-limit";
import { signPostMedia, type SignMediaDownload } from "../shared/post-media";
import { InvalidPostCursorError } from "../shared/post-page-cursor";
import {
  listProfilePostsErrorResponses,
  readableProfilePostsSchema,
  profilePostsPageSchema,
  restrictedProfilePostsSchema,
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

const security: Array<Record<string, string[]>> = [{}, { BearerAuth: [] }, { cookieAuth: [] }];

const listProfilePostsRoute = createRoute({
  method: "get",
  path: "/api/v1/profiles/{username}/posts",
  tags: ["Posts"],
  operationId: "posts.listProfilePosts",
  summary: "List the posts on a profile",
  description: "Returns one person's posts, newest Auckland day first. Owners retain solo and unreleased posts. Active friends and public-profile readers receive released `friends` posts. A private non-friend receives only the username and a generic restricted state, with no page metadata. Access is re-checked on every page. Unknown, inactive, banned, and blocked profiles all return 404.",
  security,
  request: { params: profilePostsParamsSchema, query: profilePostsQuerySchema },
  responses: {
    200: {
      description: "One page of the profile's posts.",
      content: { "application/json": { schema: readableProfilePostsSchema } },
    },
    ...listProfilePostsErrorResponses,
  },
});

export function registerListProfilePostsRoute(app: OpenAPIHono<OptionalAuthenticatedApiEnv>, dependencies: ListProfilePostsRouteDependencies) {
  // Keep the page and minimal restricted contracts available to generated
  // clients even though this operation returns their discriminated wire shape.
  app.openAPIRegistry.register("ProfilePostsPage", profilePostsPageSchema);
  app.openAPIRegistry.register("RestrictedProfilePosts", restrictedProfilePostsSchema);
  app.use("/api/v1/profiles/:username/posts", createOptionalSession(dependencies.resolveSession, dependencies.rateLimiter));
  app.openapi(listProfilePostsRoute, async (context) => {
    context.header("Cache-Control", "no-store");
    if (!dependencies.repository) {
      return apiErrorResponse(context, 503, "SERVICE_UNAVAILABLE", "Post storage is temporarily unavailable.");
    }

    const { username } = context.req.valid("param");
    const { limit, cursor } = context.req.valid("query");
    const now = dependencies.now?.() ?? new Date();
    try {
      const actor = context.get("actor");
      const page = await dependencies.repository.listProfilePosts(actor?.userId ?? null, username, now, limit, cursor);
      if (!page) return apiErrorResponse(context, 404, "NOT_FOUND", "The profile was not found.");
      if ("kind" in page) return context.json(page, 200);
      const { accessTier, ...archive } = page;
      const hasMedia = archive.items.some((item) => item.media.length > 0);
      // DPP-006 adds parent-authorized public media delivery. Until then, fail
      // public-only pages rather than issuing a signed object URL.
      if (hasMedia && accessTier === "public") {
        return apiErrorResponse(context, 503, "SERVICE_UNAVAILABLE", "Public post media is temporarily unavailable.");
      }
      const sign = dependencies.signMediaDownload;
      if (hasMedia && !sign) {
        return apiErrorResponse(context, 503, "SERVICE_UNAVAILABLE", "Media is temporarily unavailable.");
      }
      const items = await Promise.all(archive.items.map(async (item) => ({
        ...item,
        media: sign ? await signPostMedia(item.media, sign, now) : [],
      })));
      return context.json({ kind: "archive" as const, ...archive, items }, 200);
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
