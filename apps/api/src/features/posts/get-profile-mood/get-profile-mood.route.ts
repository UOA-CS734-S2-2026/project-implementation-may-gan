import { createRoute, type OpenAPIHono } from "@hono/zod-openapi";
import { apiErrorResponse } from "../../../http/api-error";
import type { AuthenticatedApiEnv } from "../../../http/authenticated-actor";
import { createRequireSession, type ResolveSession } from "../../../http/middleware/require-session";
import type { ActorRateLimiter } from "../../../http/middleware/rate-limit";
import { getProfileMoodErrorResponses, moodHistorySchema, profileMoodParamsSchema, profileMoodQuerySchema } from "./get-profile-mood.contract";
import type { ProfileMoodRepository } from "./get-profile-mood.repository";

export interface GetProfileMoodRouteDependencies {
  /** Resolves the Better Auth cookie or bearer session; never trusts a request-supplied user. */
  resolveSession: ResolveSession;
  repository?: ProfileMoodRepository;
  now?: () => Date;
  rateLimiter?: ActorRateLimiter;
}

const security: Array<Record<string, string[]>> = [{ BearerAuth: [] }, { cookieAuth: [] }];

const getProfileMoodRoute = createRoute({
  method: "get",
  path: "/api/v1/profiles/{username}/mood",
  tags: ["Posts"],
  operationId: "posts.getProfileMood",
  summary: "Read a profile's mood history",
  description: "Returns one person's daily ratings over the last 30 days, 90 days or year, with a summary of that range and of the same-length range before it. It reaches the same people as their posts: the owner, including solo and unreleased posts, and active friends, who see released `friends` posts only. Anyone else gets 403. Unknown, banned and blocked profiles all return 404.",
  security,
  request: { params: profileMoodParamsSchema, query: profileMoodQuerySchema },
  responses: {
    200: { description: "The profile's mood history, as the caller may see it.", content: { "application/json": { schema: moodHistorySchema } } },
    ...getProfileMoodErrorResponses,
  },
});

export function registerGetProfileMoodRoute(app: OpenAPIHono<AuthenticatedApiEnv>, dependencies: GetProfileMoodRouteDependencies) {
  app.use("/api/v1/profiles/:username/mood", createRequireSession(dependencies.resolveSession, dependencies.rateLimiter));
  app.openapi(getProfileMoodRoute, async (context) => {
    context.header("Cache-Control", "no-store");
    if (!dependencies.repository) {
      return apiErrorResponse(context, 503, "SERVICE_UNAVAILABLE", "Post storage is temporarily unavailable.");
    }
    const now = dependencies.now?.() ?? new Date();
    try {
      const outcome = await dependencies.repository.findProfileMood(
        context.get("actor").userId,
        context.req.valid("param").username,
        context.req.valid("query").range,
        now,
      );
      if (outcome.kind === "notFound") return apiErrorResponse(context, 404, "NOT_FOUND", "The profile was not found.");
      if (outcome.kind === "forbidden") return apiErrorResponse(context, 403, "FORBIDDEN", "Only friends can see this mood history.");
      return context.json(outcome.history, 200);
    } catch (error) {
      // Never forward SQL or private content to the client.
      console.error("dayli profile mood read failed", error instanceof Error ? error.name : "unknown");
      return apiErrorResponse(context, 503, "SERVICE_UNAVAILABLE", "Post storage is temporarily unavailable.");
    }
  });
}
