import { createRoute, type OpenAPIHono } from "@hono/zod-openapi";
import { healthResponseSchema } from "./get-health.contract";

const healthRoute = createRoute({
  method: "get",
  path: "/api/v1/health",
  tags: ["System"],
  operationId: "system.health",
  summary: "Check API availability",
  responses: {
    200: {
      description: "The API is available.",
      content: { "application/json": { schema: healthResponseSchema } },
    },
  },
});

export function registerHealthRoute(app: OpenAPIHono) {
  app.openapi(healthRoute, (context) =>
    context.json({ status: "ok" as const, service: "dayli-api" as const }, 200),
  );
}
