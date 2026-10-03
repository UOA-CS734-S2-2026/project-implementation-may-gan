import type { HyperdriveBinding } from "@dayli/db";
import { createAucklandDayService } from "@dayli/domain";
import { createFutureSelfNoteDeliveryDispatcher } from "./dispatch-future-self-note-delivery";
import { createHyperdriveFutureSelfNoteDeliveryStore } from "./future-self-note-delivery-store";

/** Builds a dispatcher that owns no database client between invocations. */
export function createFutureSelfNoteDeliveryDispatcherForEnv(env: { HYPERDRIVE: HyperdriveBinding }) {
  const clock = { now: () => new Date() };
  return createFutureSelfNoteDeliveryDispatcher({
    store: createHyperdriveFutureSelfNoteDeliveryStore(env.HYPERDRIVE),
    clock,
    dayService: createAucklandDayService(clock),
  });
}
