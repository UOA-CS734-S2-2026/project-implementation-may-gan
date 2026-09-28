import { createRoute, type OpenAPIHono } from "@hono/zod-openapi";
import type { Env } from "hono";
import {
  apiErrorSchema,
  cursorPaginationQuerySchema,
  testResponseSchema,
} from "./contract";
import { getContractExample } from "./service";

const testContractsRoute = createRoute({
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

export function registerTestContractsRoute<E extends Env>(app: OpenAPIHono<E>) {
  app.openapi(testContractsRoute, (context) => {
    const { limit } = context.req.valid("query");
    return context.json(getContractExample(new Date(), limit), 200);
  });
}
