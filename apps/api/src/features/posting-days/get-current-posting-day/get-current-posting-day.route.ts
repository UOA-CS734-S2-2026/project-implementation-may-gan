import type { OpenAPIHono } from "@hono/zod-openapi";
import type { AuthenticatedApiEnv } from "../../../http/authenticated-actor";
import { createRoute } from "@hono/zod-openapi";
import { apiErrorSchema } from "./get-current-posting-day.contract";
import {
  type CurrentPostingDayService,
} from "./get-current-posting-day.service";
import { currentPostingDayResponseSchema } from "./get-current-posting-day.contract";
import { createRequireSession, type ResolveSession } from "../../../http/middleware/require-session";
import { rateLimitErrorResponse } from "../../../http/rate-limit-contract";
import type { ActorRateLimiter } from "../../../http/middleware/rate-limit";

export interface CurrentPostingDayRouteDependencies {
  resolveSession: ResolveSession;
  service?: CurrentPostingDayService;
  rateLimiter?: ActorRateLimiter;
}

const security: Array<Record<string, string[]>> = [
  { BearerAuth: [] },
  { cookieAuth: [] },
];

const currentPostingDayRoute = createRoute({
  method: "get",
  path: "/api/v1/posting-days/current",
  tags: ["Posting Days"],
  operationId: "postingDays.current",
  summary: "Read the current Auckland posting day",
  security,
  responses: {
    200: {
      description: "The server-owned current posting day and scheduled prompt.",
      content: { "application/json": { schema: currentPostingDayResponseSchema } },
    },
    401: {
      description: "Authentication is required.",
      content: { "application/json": { schema: apiErrorSchema } },
    },
    429: rateLimitErrorResponse,
    503: {
      description: "The prompt or posting-state dependency is temporarily unavailable.",
      content: { "application/json": { schema: apiErrorSchema } },
    },
  },
});

function errorResponse(
  context: Parameters<Parameters<OpenAPIHono<AuthenticatedApiEnv>["openapi"]>[1]>[0],
  status: 401 | 503,
  code: "UNAUTHENTICATED" | "SERVICE_UNAVAILABLE",
  message: string,
) {
  context.header("Cache-Control", "no-store");
  return context.json({
    error: { code, message, requestId: crypto.randomUUID() },
  }, status);
}

export function registerCurrentPostingDayRoute(
  app: OpenAPIHono<AuthenticatedApiEnv>,
  dependencies: CurrentPostingDayRouteDependencies,
) {
  app.use("/api/v1/posting-days/current", createRequireSession(dependencies.resolveSession, dependencies.rateLimiter));
  app.openapi(currentPostingDayRoute, async (context) => {
    context.header("Cache-Control", "no-store");

    const userId = context.get("actor").userId;
    if (!dependencies.service) {
      return errorResponse(context, 503, "SERVICE_UNAVAILABLE", "The posting-day service is temporarily unavailable.");
    }

    try {
      const postingDay = await dependencies.service.getCurrentPostingDay(userId);
      return context.json({
        serverNow: postingDay.serverNow.toISOString(),
        localDate: postingDay.localDate,
        deadlineAt: postingDay.deadlineAt.toISOString(),
        releaseAt: postingDay.releaseAt.toISOString(),
        prompt: postingDay.prompt,
        hasPosted: postingDay.hasPosted,
      }, 200);
    } catch {
      return errorResponse(context, 503, "SERVICE_UNAVAILABLE", "The posting-day service is temporarily unavailable.");
    }
  });
}
