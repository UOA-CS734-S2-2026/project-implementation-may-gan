import { createAppForEnv, app } from "./app";
import type { ApiEnv } from "./env";
import { createMediaCleanupDispatcherForEnv } from "./infrastructure/jobs/media-cleanup-runtime";
import { createMessagingDeliveryDispatcher } from "./infrastructure/jobs/messaging-delivery-runtime";
import { createFutureSelfNoteDeliveryDispatcherForEnv } from "./infrastructure/jobs/future-self-note-delivery-runtime";
import { readBetterAuthRuntimeConfiguration } from "./features/auth/better-auth";
import { withHyperdriveDatabase } from "./infrastructure/database/hyperdrive";
import { pruneExpiredGoogleManagementIntents } from "./features/account-policy/reauthenticate/google/google-proof.repository";

export { app };
export { BrowserProxyEntrypoint } from "./http/browser-proxy-entrypoint";
export { HyperdriveIntegrationEntrypoint } from "./features/system/hyperdrive/integration-entrypoint";
export { UserRealtime } from "./infrastructure/realtime/user-realtime";

export default {
  fetch(request: Request, env: ApiEnv, context: ExecutionContext): Response | Promise<Response> {
    // Public Worker subrequests can select their own source IP. The private
    // BrowserProxyEntrypoint does not use this public fetch handler.
    if (request.headers.has("cf-worker")) return Response.json({ error: { code: "WORKER_ORIGIN_NOT_ALLOWED" } }, {
      status: 403,
      headers: { "Cache-Control": "no-store" },
    });
    return createAppForEnv(env).fetch(request, env, context);
  },
  scheduled(_event: ScheduledEvent, env: ApiEnv, context: ExecutionContext): void {
    // Scheduled repair owns a fresh database client. It never reuses request-scoped state.
    if (env.USER_REALTIME) context.waitUntil(createMessagingDeliveryDispatcher({ ...env, USER_REALTIME: env.USER_REALTIME }).dispatchScheduled());
    context.waitUntil(runMediaCleanup(env));
    context.waitUntil(runGoogleIntentExpiry(env));
    context.waitUntil(runFutureSelfNoteDelivery(env));
  },
};

/** Counts only. The summary never carries object keys, owners, or errors. */
async function runGoogleIntentExpiry(env: ApiEnv): Promise<void> {
  try {
    const configuration = readBetterAuthRuntimeConfiguration(env);
    if (configuration?.google) await withHyperdriveDatabase(
      configuration.hyperdrive, (database) => pruneExpiredGoogleManagementIntents(database),
    );
  } catch {
    console.error("google management intent expiry failed");
  }
}

/** Counts only. Records delivered state; it never sends push, and it never logs a note or its owner. */
async function runFutureSelfNoteDelivery(env: ApiEnv): Promise<void> {
  try {
    const summary = await createFutureSelfNoteDeliveryDispatcherForEnv(env).dispatchScheduled();
    if (summary.claimed > 0) console.info("future-self note delivery", summary);
  } catch {
    console.error("future-self note delivery failed");
  }
}

async function runMediaCleanup(env: ApiEnv): Promise<void> {
  try {
    const summary = await createMediaCleanupDispatcherForEnv(env)?.dispatchScheduled();
    if (summary && summary.claimed > 0) console.info("media cleanup", summary);
  } catch {
    console.error("media cleanup failed");
  }
}
