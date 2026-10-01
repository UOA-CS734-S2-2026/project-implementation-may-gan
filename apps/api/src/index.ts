import { createAppForEnv, app } from "./app";
import type { ApiEnv } from "./env";
import { createMediaCleanupDispatcherForEnv } from "./infrastructure/jobs/media-cleanup-runtime";
import { createMessagingDeliveryDispatcher } from "./infrastructure/jobs/messaging-delivery-runtime";

export { app };
export { BrowserProxyEntrypoint } from "./http/browser-proxy-entrypoint";
export { HyperdriveIntegrationEntrypoint } from "./features/system/hyperdrive/integration-entrypoint";
export { UserRealtime } from "./infrastructure/realtime/user-realtime";

export default {
  fetch(request: Request, env: ApiEnv, context: ExecutionContext): Response | Promise<Response> {
    return createAppForEnv(env).fetch(request, env, context);
  },
  scheduled(_event: ScheduledEvent, env: ApiEnv, context: ExecutionContext): void {
    // Scheduled repair owns a fresh database client. It never reuses request-scoped state.
    if (env.USER_REALTIME) context.waitUntil(createMessagingDeliveryDispatcher({ ...env, USER_REALTIME: env.USER_REALTIME }).dispatchScheduled());
    context.waitUntil(runMediaCleanup(env));
  },
};

/** Counts only. The summary never carries object keys, owners, or errors. */
async function runMediaCleanup(env: ApiEnv): Promise<void> {
  try {
    const summary = await createMediaCleanupDispatcherForEnv(env)?.dispatchScheduled();
    if (summary && summary.claimed > 0) console.info("media cleanup", summary);
  } catch {
    console.error("media cleanup failed");
  }
}
