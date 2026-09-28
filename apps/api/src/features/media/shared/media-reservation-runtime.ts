import type { HyperdriveBinding } from "@dayli/db";
import { withHyperdriveDatabase } from "../../../infrastructure/database/hyperdrive";
import { createR2Reader, type MediaR2Reader, type R2RuntimeConfiguration } from "../../../infrastructure/media/r2";
import {
  createDrizzleMediaReservationRepository,
  type MediaReservationRepository,
} from "./media-reservation.repository";

/** The configured media providers and request-scoped persistence operation. */
export interface MediaReservationRuntime {
  r2: R2RuntimeConfiguration;
  r2Reader: MediaR2Reader;
  withRepository<T>(operation: (repository: MediaReservationRepository) => Promise<T>): Promise<T>;
}

export function createHyperdriveMediaReservationRuntime(
  hyperdrive: HyperdriveBinding,
  r2: R2RuntimeConfiguration,
  r2Reader: MediaR2Reader = createR2Reader(r2),
): MediaReservationRuntime {
  return {
    r2,
    r2Reader,
    withRepository(operation) {
      return withHyperdriveDatabase(hyperdrive, async (database) => (
        operation(createDrizzleMediaReservationRepository(database))
      ));
    },
  };
}
