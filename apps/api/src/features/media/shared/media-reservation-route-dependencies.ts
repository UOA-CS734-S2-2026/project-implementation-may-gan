import type { ResolveSession } from "../../../http/middleware/require-session";
import type { ActorRateLimiter } from "../../../http/middleware/rate-limit";
import type { MediaReservationRuntime } from "./media-reservation-runtime";

export interface MediaReservationRouteDependencies {
  runtime?: MediaReservationRuntime;
  resolveSession?: ResolveSession;
  rateLimiter?: ActorRateLimiter;
}
