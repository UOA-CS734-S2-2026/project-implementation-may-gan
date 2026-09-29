import type { OpenAPIHono } from "@hono/zod-openapi";
import type { AuthenticatedApiEnv } from "../../http/authenticated-actor";
import { registerApiDocsRoute } from "./get-api-docs/get-api-docs.route";
import { registerHealthRoute } from "./get-health/get-health.route";
import { registerTestContractsRoute } from "./test-contracts/test-contracts.route";

export function registerSystemRoutes(app: OpenAPIHono<AuthenticatedApiEnv>) {
  registerHealthRoute(app);
  registerTestContractsRoute(app);
  registerApiDocsRoute(app);
}
