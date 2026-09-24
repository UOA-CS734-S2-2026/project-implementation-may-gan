import type { HyperdriveBinding } from "@dayli/db";
import { withHyperdriveDatabase } from "../../../lib/hyperdrive";
import type { R2RuntimeConfiguration } from "../../../lib/r2";
import { resolveSession, type AuthenticatedUser, type SessionRuntimeConfiguration } from "../../../lib/session";
import { createDrizzleMediaReservationRepository, type MediaReservationRepository } from "./repository";

export interface MediaReservationRequestContext {
  user: AuthenticatedUser | undefined;
  repository: MediaReservationRepository;
}

/**
 * Everything the media-reservation routes need per request, behind a seam that a
 * fake in-memory implementation can satisfy for unit tests without real Postgres
 * (see route.test.ts) — production wiring is createHyperdriveMediaReservationRuntime.
 * R2 presigning itself doesn't: it's a local computation (see lib/r2.ts), so tests 
 * can call the real createPresignedUploadUrl with fake credentials directly.
 */
export interface MediaReservationRuntime {
  r2: R2RuntimeConfiguration;
  withRequestContext<T>(
    request: Request,
    operation: (context: MediaReservationRequestContext) => Promise<T>,
  ): Promise<T>;
}

export function createHyperdriveMediaReservationRuntime(
  hyperdrive: HyperdriveBinding,
  session: SessionRuntimeConfiguration,
  r2: R2RuntimeConfiguration,
): MediaReservationRuntime {
  return {
    r2,
    withRequestContext(request, operation) {
      return withHyperdriveDatabase(hyperdrive, async (db) => {
        const user = await resolveSession(request, session, db);
        const repository = createDrizzleMediaReservationRepository(db);
        return operation({ user, repository });
      });
    },
  };
}
