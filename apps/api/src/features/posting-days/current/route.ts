import type { OpenAPIHono } from "@hono/zod-openapi";
import { createRoute } from "@hono/zod-openapi";
import { apiErrorSchema } from "./contract";
import {
  MissingDailyPromptError,
  PostingDayDependencyUnavailableError,
  type CurrentPostingDayService,
} from "./service";
import { currentPostingDayResponseSchema } from "./contract";

export interface CurrentPostingDayRouteDependencies {
  authenticate: (request: Request) => Promise<string | null>;
  service?: CurrentPostingDayService;
}

const currentPostingDayRoute = createRoute({
  method: "get",
  path: "/api/v1/posting-days/current",
  tags: ["Posting Days"],
  operationId: "postingDays.current",
  summary: "Read the current Auckland posting day",
  responses: {
    200: {
      description: "The server-owned current posting day and scheduled prompt.",
      content: { "application/json": { schema: currentPostingDayResponseSchema } },
    },
    401: {
      description: "Authentication is required.",
      content: { "application/json": { schema: apiErrorSchema } },
    },
    503: {
      description: "The prompt or posting-state dependency is temporarily unavailable.",
      content: { "application/json": { schema: apiErrorSchema } },
    },
  },
});

function errorResponse(
  context: Parameters<Parameters<OpenAPIHono["openapi"]>[1]>[0],
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
  app: OpenAPIHono,
  dependencies: CurrentPostingDayRouteDependencies,
) {
  app.openapi(currentPostingDayRoute, async (context) => {
    context.header("Cache-Control", "no-store");

    let userId: string | null;
    try {
      userId = await dependencies.authenticate(context.req.raw);
    } catch {
      return errorResponse(context, 503, "SERVICE_UNAVAILABLE", "The posting-day service is temporarily unavailable.");
    }

    if (!userId) {
      return errorResponse(context, 401, "UNAUTHENTICATED", "Authentication is required.");
    }

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
    } catch (error) {
      if (error instanceof MissingDailyPromptError || error instanceof PostingDayDependencyUnavailableError) {
        return errorResponse(context, 503, "SERVICE_UNAVAILABLE", "The posting-day service is temporarily unavailable.");
      }
      return errorResponse(context, 503, "SERVICE_UNAVAILABLE", "The posting-day service is temporarily unavailable.");
    }
  });
}
