import { createRoute, type OpenAPIHono } from "@hono/zod-openapi";
import { createAucklandDayService } from "@dayli/domain";
import { apiErrorResponse } from "../../../http/api-error";
import type { AuthenticatedApiEnv } from "../../../http/authenticated-actor";
import type { ActorRateLimiter } from "../../../http/middleware/rate-limit";
import { createRequireSession, type ResolveSession } from "../../../http/middleware/require-session";
import { createRequireUsername, type HasUsername } from "../../../http/middleware/require-username";
import { signPostMedia, type SignMediaDownload } from "../shared/post-media";
import {
  listOnThisDayErrorResponses,
  onThisDayResponseSchema,
} from "./list-on-this-day.contract";
import type { OnThisDayRepository } from "./list-on-this-day.repository";

export interface ListOnThisDayRouteDependencies {
  /** Resolves the Better Auth cookie or bearer session; never trusts a request-supplied user. */
  resolveSession: ResolveSession;
  /** Blocks the route until the caller has chosen a username, like the other interaction routes. */
  hasUsername?: HasUsername;
  repository?: OnThisDayRepository;
  /** The server clock. "Today" is always its Auckland date; the client cannot supply one. */
  now?: () => Date;
  rateLimiter?: ActorRateLimiter;
  /** Absent when media storage isn't configured; a memory with media is then a 503. */
  signMediaDownload?: SignMediaDownload;
}

const security: Array<Record<string, string[]>> = [{ BearerAuth: [] }, { cookieAuth: [] }];

export const onThisDayPath = "/api/v1/me/memories/on-this-day";

const listOnThisDayRoute = createRoute({
  method: "get",
  path: onThisDayPath,
  tags: ["Posts"],
  operationId: "posts.listOnThisDay",
  summary: "List the caller's On This Day memories",
  description: "Returns the caller's own posts from today's Auckland month and day in earlier years, newest year first, at most one per year. Only the caller's posts are ever returned, solo and friends alike. Posts in Trash or awaiting purge, and posts from the current year, are left out. A 29 February post is a memory only on 29 February of a later leap year. The date is the server's current Auckland date and cannot be supplied by the client.",
  security,
  responses: {
    200: {
      description: "The caller's memories for today.",
      content: { "application/json": { schema: onThisDayResponseSchema } },
    },
    ...listOnThisDayErrorResponses,
  },
});

export function registerListOnThisDayRoute(app: OpenAPIHono<AuthenticatedApiEnv>, dependencies: ListOnThisDayRouteDependencies) {
  app.use(onThisDayPath, createRequireSession(dependencies.resolveSession, dependencies.rateLimiter));
  app.use(onThisDayPath, createRequireUsername(dependencies.hasUsername, "Choose a username before using memories."));
  app.openapi(listOnThisDayRoute, async (context) => {
    context.header("Cache-Control", "no-store");
    if (!dependencies.repository) {
      return apiErrorResponse(context, 503, "SERVICE_UNAVAILABLE", "Post storage is temporarily unavailable.");
    }

    const now = dependencies.now?.() ?? new Date();
    try {
      const today = createAucklandDayService().forInstant(now).localDate;
      const records = await dependencies.repository.listOnThisDay(context.get("actor").userId, today, now);
      const sign = dependencies.signMediaDownload;
      if (records.some((record) => record.media.length > 0) && !sign) {
        return apiErrorResponse(context, 503, "SERVICE_UNAVAILABLE", "Media is temporarily unavailable.");
      }
      // Name each field instead of spreading the record, so nothing extra can leak into the response.
      const items = await Promise.all(records.map(async (record) => ({
        id: record.id,
        localDate: record.localDate,
        yearsAgo: record.yearsAgo,
        rating: record.rating,
        audience: record.audience,
        prompt: record.prompt,
        reflectiveAnswer: record.reflectiveAnswer,
        caption: record.caption,
        edited: record.edited,
        media: sign ? await signPostMedia(record.media, sign, now) : [],
      })));
      return context.json({ date: today, items }, 200);
    } catch (error) {
      // Never forward SQL or private content to the client.
      console.error("dayli on this day read failed", error instanceof Error ? error.name : "unknown");
      return apiErrorResponse(context, 503, "SERVICE_UNAVAILABLE", "Post storage is temporarily unavailable.");
    }
  });
}
