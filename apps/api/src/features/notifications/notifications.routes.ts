import type { OpenAPIHono } from "@hono/zod-openapi";
import type { AuthenticatedApiEnv } from "../../http/authenticated-actor";
import { createRequireSession, type ResolveSession } from "../../http/middleware/require-session";
import type { ActorRateLimiter } from "../../http/middleware/rate-limit";
import {
  registerNotificationPreferenceRoutes,
  type NotificationPreferenceRouteDependencies,
} from "./preference/notification-preference.route";

export interface NotificationRouteDependencies extends NotificationPreferenceRouteDependencies {
  resolveSession: ResolveSession;
  rateLimiter?: ActorRateLimiter;
}

export function registerNotificationRoutes(
  app: OpenAPIHono<AuthenticatedApiEnv>,
  dependencies: NotificationRouteDependencies,
) {
  app.use("/api/v1/notifications/*", createRequireSession(dependencies.resolveSession, dependencies.rateLimiter));
  registerNotificationPreferenceRoutes(app, dependencies);
}
