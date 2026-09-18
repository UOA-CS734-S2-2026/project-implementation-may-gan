import type { OpenAPIHono } from "@hono/zod-openapi";
import { authBasePath, type BetterAuthCompatibilitySlice } from "./better-auth";

export function registerBetterAuthCompatibilityRoutes(
  app: OpenAPIHono,
  auth: BetterAuthCompatibilitySlice,
) {
  app.on(["GET", "POST"], `${authBasePath}/*`, (context) => auth.handler(context.req.raw));
}
