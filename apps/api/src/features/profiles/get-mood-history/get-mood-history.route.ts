import { createRoute, type OpenAPIHono } from "@hono/zod-openapi";
import { apiErrorResponse } from "../../../http/api-error";
import type { AuthenticatedApiEnv } from "../../../http/authenticated-actor";
import { createRequireSession, type ResolveSession } from "../../../http/middleware/require-session";
import type { ActorRateLimiter } from "../../../http/middleware/rate-limit";
import { getMoodHistoryErrorResponses, moodHistoryQuerySchema, moodHistorySchema } from "./get-mood-history.contract";
import type { MoodHistoryRepository } from "./get-mood-history.repository";

export interface GetMoodHistoryRouteDependencies {
  /** Resolves the Better Auth cookie or bearer session; never trusts a request-supplied user. */
  resolveSession: ResolveSession;
  repository?: MoodHistoryRepository;
  now?: () => Date;
  rateLimiter?: ActorRateLimiter;
}

const security: Array<Record<string, string[]>> = [{ BearerAuth: [] }, { cookieAuth: [] }];
const path = "/api/v1/profile/mood";

const getMoodHistoryRoute = createRoute({
  method: "get",
  path,
  tags: ["Profile"],
  operationId: "profile.getMoodHistory",
  summary: "Read your mood history",
  description: "Returns the caller's own daily ratings over the last 30 days, 90 days or year, with a summary of that range and of the same-length range before it. Only the owner can read their history; there is no way to ask for anyone else's.",
  security,
  request: { query: moodHistoryQuerySchema },
  responses: {
    200: { description: "The caller's mood history.", content: { "application/json": { schema: moodHistorySchema } } },
    ...getMoodHistoryErrorResponses,
  },
});

export function registerGetMoodHistoryRoute(app: OpenAPIHono<AuthenticatedApiEnv>, dependencies: GetMoodHistoryRouteDependencies) {
  app.use(path, createRequireSession(dependencies.resolveSession, dependencies.rateLimiter));
  app.openapi(getMoodHistoryRoute, async (context) => {
    context.header("Cache-Control", "no-store");
    if (!dependencies.repository) {
      return apiErrorResponse(context, 503, "SERVICE_UNAVAILABLE", "Post storage is temporarily unavailable.");
    }
    const now = dependencies.now?.() ?? new Date();
    try {
      const history = await dependencies.repository.findMoodHistory(context.get("actor").userId, context.req.valid("query").range, now);
      if (!history) return apiErrorResponse(context, 401, "UNAUTHENTICATED", "Authentication is required.");
      return context.json(history, 200);
    } catch (error) {
      // Never forward SQL or private content to the client.
      console.error("dayli mood history read failed", error instanceof Error ? error.name : "unknown");
      return apiErrorResponse(context, 503, "SERVICE_UNAVAILABLE", "Post storage is temporarily unavailable.");
    }
  });
}
