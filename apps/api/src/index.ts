import {
  apiErrorSchema,
  aucklandDateSchema,
  cursorPaginationQuerySchema,
  utcTimestampSchema,
} from "@dayli/contracts";
import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";

const healthResponseSchema = z
  .object({
    status: z.literal("ok"),
    service: z.literal("dayli-api"),
  })
  .openapi("HealthResponse");

const testResponseSchema = z
  .object({
    message: z.literal("Dayli API contracts are available."),
    timestamp: utcTimestampSchema,
    aucklandDate: aucklandDateSchema,
    requestedLimit: z.number().int(),
  })
  .openapi("TestResponse");

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

const testRoute = createRoute({
  method: "get",
  path: "/api/v1/test",
  tags: ["System"],
  operationId: "system.testContracts",
  summary: "Exercise common API contracts",
  request: { query: cursorPaginationQuerySchema },
  responses: {
    200: {
      description: "Representative date, time, and pagination values.",
      content: { "application/json": { schema: testResponseSchema } },
    },
    422: {
      description: "The query parameters are invalid.",
      content: { "application/json": { schema: apiErrorSchema } },
    },
  },
});

const aucklandDateFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Pacific/Auckland",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export const app = new OpenAPIHono({
  defaultHook: (result, context) => {
    if (!result.success) {
      return context.json(
        {
          error: {
            code: "VALIDATION_FAILED" as const,
            message: "The request contains invalid values.",
            requestId: crypto.randomUUID(),
            details: { issues: result.error.issues },
          },
        },
        422,
      );
    }
  },
});

app.openapi(healthRoute, (context) =>
  context.json({ status: "ok" as const, service: "dayli-api" as const }, 200),
);

app.openapi(testRoute, (context) => {
  const { limit } = context.req.valid("query");
  const now = new Date();

  return context.json(
    {
      message: "Dayli API contracts are available." as const,
      timestamp: now.toISOString(),
      aucklandDate: aucklandDateFormatter.format(now),
      requestedLimit: limit,
    },
    200,
  );
});

app.doc("/api/v1/openapi.json", {
  openapi: "3.1.0",
  info: {
    title: "Dayli API",
    version: "1.0.0",
    description: "REST API shared by the Dayli mobile and web clients.",
  },
});

export default app;
