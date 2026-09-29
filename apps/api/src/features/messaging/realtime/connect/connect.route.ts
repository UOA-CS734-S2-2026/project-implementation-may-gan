import type { OpenAPIHono } from "@hono/zod-openapi";
import type { AuthenticatedApiEnv } from "../../../../http/authenticated-actor";
import { connectRealtime, type RealtimeConnectDependencies } from "./connect";

export type RealtimeConnectRouteDependencies = Partial<RealtimeConnectDependencies>;

/** This protocol upgrade intentionally stays outside OpenAPI's JSON operations. */
export function registerConnectRealtimeRoute(app: OpenAPIHono<AuthenticatedApiEnv>, dependencies: RealtimeConnectRouteDependencies) {
  app.get("/api/v1/realtime/connect", (context) => {
    if (!dependencies.tickets || !dependencies.resolveActiveSession || !dependencies.userRealtime || !dependencies.trustedOrigins) {
      return new Response("Realtime is temporarily unavailable.", { status: 503, headers: { "Cache-Control": "no-store" } });
    }
    return connectRealtime(context.req.raw, {
      tickets: dependencies.tickets,
      resolveActiveSession: dependencies.resolveActiveSession,
      userRealtime: dependencies.userRealtime,
      trustedOrigins: dependencies.trustedOrigins,
      hasUsername: dependencies.hasUsername,
    });
  });
}

export { registerConnectRealtimeRoute as registerRealtimeConnectRoute };
