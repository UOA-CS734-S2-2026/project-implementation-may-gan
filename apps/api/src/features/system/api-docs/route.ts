import { Scalar } from "@scalar/hono-api-reference";
import type { OpenAPIHono } from "@hono/zod-openapi";

export function registerApiDocsRoute(app: OpenAPIHono) {
  app.get(
    "/docs",
    Scalar({
      url: "/api/v1/openapi.json",
      pageTitle: "Dayli API Reference",
    }),
  );
}
