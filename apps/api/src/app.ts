import { OpenAPIHono } from "@hono/zod-openapi";
import {
  registerBetterAuthCompatibilityRoutes,
} from "./features/auth/route";
import type { BetterAuthCompatibilitySlice } from "./features/auth/better-auth";
import { registerApiDocsRoute } from "./features/system/api-docs/route";
import { registerHealthRoute } from "./features/system/health/route";
import { registerTestContractsRoute } from "./features/system/test-contracts/route";

export function createApp(auth?: BetterAuthCompatibilitySlice) {
  const api = new OpenAPIHono({
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

  if (auth) {
    registerBetterAuthCompatibilityRoutes(api, auth);
  }

  registerHealthRoute(api);
  registerTestContractsRoute(api);
  registerApiDocsRoute(api);

  api.doc("/api/v1/openapi.json", {
    openapi: "3.1.0",
    info: {
      title: "Dayli API",
      version: "1.0.0",
      description: "REST API shared by the Dayli mobile and web clients.",
    },
  });

  return api;
}

export const app = createApp();
