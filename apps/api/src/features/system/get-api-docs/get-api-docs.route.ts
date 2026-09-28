import { Scalar } from "@scalar/hono-api-reference";
import type { OpenAPIHono } from "@hono/zod-openapi";
import type { Env } from "hono";

export function registerApiDocsRoute<E extends Env>(app: OpenAPIHono<E>) {
  app.get(
    "/docs",
    Scalar({
      url: "/api/v1/openapi.json",
      pageTitle: "Dayli API Reference",
    }),
  );
}
