import type { OpenAPIHono } from "@hono/zod-openapi";
import type { AuthenticatedApiEnv } from "../../http/authenticated-actor";
import { createRequireSession } from "../../http/middleware/require-session";
import { registerCompleteMediaReservationRoute } from "./complete/complete.route";
import { registerGetReservationRoute } from "./get-reservation/get-reservation.route";
import { registerReserveUploadRoute } from "./reserve-upload/reserve-upload.route";
import type { MediaReservationRouteDependencies } from "./shared/media-reservation-route-dependencies";

export type { MediaReservationRouteDependencies } from "./shared/media-reservation-route-dependencies";
export type { MediaReservationRuntime } from "./shared/media-reservation-runtime";
export { createHyperdriveMediaReservationRuntime } from "./shared/media-reservation-runtime";

/** Register media routes without constructing runtime providers for the DB-free app. */
export function registerMediaReservationRoutes(
  app: OpenAPIHono<AuthenticatedApiEnv>,
  dependencies: MediaReservationRouteDependencies = {},
) {
  // Preserve unavailable-mode behavior. A missing runtime returns its documented
  // 503 rather than attempting session resolution in the DB-free default app.
  if (dependencies.runtime && dependencies.resolveSession) {
    app.use("/api/v1/media-reservations/*", createRequireSession(dependencies.resolveSession, dependencies.rateLimiter));
    app.use("/api/v1/media-reservations", createRequireSession(dependencies.resolveSession, dependencies.rateLimiter));
  }
  registerReserveUploadRoute(app, dependencies);
  registerGetReservationRoute(app, dependencies);
  registerCompleteMediaReservationRoute(app, dependencies);
}
