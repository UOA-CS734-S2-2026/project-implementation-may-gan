import type { ResolveSession } from "../../../http/require-session";
import type { MediaReservationRuntime } from "./media-reservation-runtime";

export interface MediaReservationRouteDependencies {
  runtime?: MediaReservationRuntime;
  resolveSession?: ResolveSession;
}
