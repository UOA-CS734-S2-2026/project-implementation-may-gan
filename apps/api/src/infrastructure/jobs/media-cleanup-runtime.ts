import type { HyperdriveBinding } from "@dayli/db";
import { createR2Deleter, readR2RuntimeConfiguration, type R2WorkerBindings } from "../media/r2";
import { createMediaCleanupDispatcher } from "./dispatch-media-cleanup";
import { createHyperdriveMediaCleanupStore } from "./media-cleanup-store";

/**
 * Cleanup needs the same R2 credentials as uploads. Without them there is nothing
 * to delete from, so the scheduled run is skipped rather than tombstoning rows
 * it can't finish.
 */
export function createMediaCleanupDispatcherForEnv(env: Partial<R2WorkerBindings> & { HYPERDRIVE: HyperdriveBinding }) {
  const r2 = readR2RuntimeConfiguration(env);
  if (!r2) return undefined;
  return createMediaCleanupDispatcher({
    store: createHyperdriveMediaCleanupStore(env.HYPERDRIVE),
    deleter: createR2Deleter(r2),
  });
}
