import { OpenAPIHono } from "@hono/zod-openapi";
import {
  registerBetterAuthCompatibilityRoutes,
  registerPostgresBetterAuthRoutes,
} from "./features/auth/route";
import { readBetterAuthRuntimeConfiguration, type BetterAuthCompatibilitySlice } from "./features/auth/better-auth";
import type { ApiEnv } from "./env";
import { registerApiDocsRoute } from "./features/system/api-docs/route";
import { registerHealthRoute } from "./features/system/health/route";
import { registerTestContractsRoute } from "./features/system/test-contracts/route";
import {
  createHyperdriveMediaReservationRuntime,
  registerMediaReservationRoutes,
  type MediaReservationRuntime,
} from "./features/media/reserve/route";
import { readR2RuntimeConfiguration } from "./lib/r2";

export function createApp(auth?: BetterAuthCompatibilitySlice, media?: MediaReservationRuntime) {
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
  registerMediaReservationRoutes(api, media);
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

/**
 * Build a Worker request app. Auth remains absent until validated bindings exist.
 * Media reservations go down whenever Better Auth's own bindings are invalid too,
 * since reservations resolve sessions through that same authority.
 */
export function createAppForEnv(env: ApiEnv) {
  const authRuntime = readBetterAuthRuntimeConfiguration(env);
  const r2Runtime = readR2RuntimeConfiguration(env);
  const media: MediaReservationRuntime | undefined = authRuntime && r2Runtime
    ? createHyperdriveMediaReservationRuntime(
        authRuntime.hyperdrive,
        { baseURL: authRuntime.baseURL, secret: authRuntime.secret, trustedOrigins: authRuntime.trustedOrigins },
        r2Runtime,
      )
    : undefined;

  const api = createApp(undefined, media);
  registerPostgresBetterAuthRoutes(api, env);
  return api;
}

/** The default app is intentionally database and auth free for local route work. */
export const app = createApp();
