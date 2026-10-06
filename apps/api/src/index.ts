import { createAppForEnv, app } from "./app";
import { notificationPublishersEnabled, type ApiEnv } from "./env";
import { publishDailyNotifications } from "./infrastructure/notifications/daily-notification-scheduler";
import { createMediaCleanupDispatcherForEnv } from "./infrastructure/jobs/media-cleanup-runtime";
import { createMessagingDeliveryDispatcher } from "./infrastructure/jobs/messaging-delivery-runtime";
import { createFutureSelfNoteDeliveryDispatcherForEnv } from "./infrastructure/jobs/future-self-note-delivery-runtime";
import { createNotificationDeliveryDispatcher } from "./infrastructure/notifications/notification-runtime";
import { readBetterAuthRuntimeConfiguration } from "./features/auth/better-auth";
import { withHyperdriveDatabase } from "./infrastructure/database/hyperdrive";
import { pruneExpiredGoogleManagementIntents } from "./features/account-policy/reauthenticate/google/google-proof.repository";
import { exportExecutionEnabled, readStagingExportProof, stagingExportAllUsersEnabled,
  stagingExportCleanupOnlyEnabled } from "./features/data-export/shared/export-activation";
import { createExportRuntimeForEnv } from "./infrastructure/jobs/export-runtime";
import { runPostTrashCleanupForEnv } from "./infrastructure/jobs/post-trash-runtime";
import { realtimeRevocationBindingFailure, runRealtimeRevocationsForEnv } from "./infrastructure/jobs/account-realtime-revocation";
import { runAccountPurgeReportForEnv } from "./infrastructure/jobs/account-purge-runtime";
import { accountPurgeControlUnavailable, accountPurgeProviderIncident } from "./infrastructure/jobs/account-purge";

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
    context.waitUntil(runNotificationMaintenance(env));
    context.waitUntil(runMediaCleanup(env));
    context.waitUntil(runPostTrashCleanup(env));
    context.waitUntil(runGoogleIntentExpiry(env));
    const allStagingExports = stagingExportAllUsersEnabled(env);
    const proof = allStagingExports ? null : readStagingExportProof(env);
    if (exportExecutionEnabled || allStagingExports || stagingExportCleanupOnlyEnabled(env) || proof?.cleanupEnabled) {
      context.waitUntil(runExportMaintenance(env, proof ?? undefined, allStagingExports));
    }
    context.waitUntil(runFutureSelfNoteDelivery(env));
    context.waitUntil(runRealtimeRevocationMaintenance(env));
    context.waitUntil(runAccountPurgeReportMaintenance(env));
  },
};

/** Aggregate counts only. This scheduled path cannot select or delete object keys. */
export async function runAccountPurgeReportMaintenance(env: ApiEnv): Promise<void> {
  try {
    const summary = await runAccountPurgeReportForEnv(env);
    if (summary?.report && accountPurgeControlUnavailable(summary.report)) {
      console.error("account purge operator control unavailable", summary);
    } else if (summary?.report && accountPurgeProviderIncident(summary.report)) {
      console.error("account purge provider drain requires attention", summary);
    } else if (summary?.report && (summary.report.due > 0 || summary.report.failed > 0
      || summary.report.terminalFailed > 0 || summary.report.terminalCleanup > 0
      || summary.report.startedOperations > 0)) {
      console.info("account purge report", summary);
    }
  } catch {
    console.error("account purge report failed");
  }
}

/** Counts only. Owner and session identifiers never enter monitoring output. */
async function runRealtimeRevocationMaintenance(env: ApiEnv): Promise<void> {
  try {
    let reason = realtimeRevocationBindingFailure(env);
    const summary = await runRealtimeRevocationsForEnv(env, failure => { reason = failure; });
    if (!summary) console.error("account realtime revocation bindings unavailable", env.API_RATE_LIMIT_SCOPE === "staging" ? { reason } : undefined);
    else {
      if (env.API_RATE_LIMIT_SCOPE === "staging") console.info("account realtime revocation role verified", { appRoleVerified: true, workerRoleVerified: true });
      if (summary.claimed > 0 || summary.report.due > 0 || summary.report.failed > 0) console.info("account realtime revocation", summary);
    }
  } catch {
    console.error("account realtime revocation failed");
  }
}

async function runNotificationMaintenance(env: ApiEnv): Promise<void> {
  if (notificationPublishersEnabled(env)) {
    try {
      await withHyperdriveDatabase(env.HYPERDRIVE, (database) => publishDailyNotifications(database, { now: new Date() }));
    } catch {
      console.error("notification publication failed");
    }
  }
  try {
    await (await createNotificationDeliveryDispatcher(env)).dispatchScheduled();
  } catch {
    console.error("notification maintenance failed");
  }
}

/** Counts only. Invalid or missing lifecycle/storage bindings perform no work. */
async function runPostTrashCleanup(env: ApiEnv): Promise<void> {
  try {
    const summary = await runPostTrashCleanupForEnv(env);
    if (summary && summary.claimed > 0) console.info("post trash cleanup", summary);
  } catch {
    console.error("post trash cleanup failed");
  }
}

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

async function runExportMaintenance(env: ApiEnv, proof?: { userId: string; buildEnabled: boolean }, allStagingExports = false): Promise<void> {
  const runtime = createExportRuntimeForEnv(env, proof?.userId);
  if (!runtime) {
    console.error("export maintenance bindings unavailable");
    return;
  }
  const results = await Promise.allSettled([
    runtime.runCleanupOnce(),
    ...((exportExecutionEnabled || allStagingExports || proof?.buildEnabled) ? [runtime.runBuildOnce()] : []),
  ]);
  if (results[0]?.status === "rejected") console.error("export cleanup failed");
  if (results[1]?.status === "rejected") console.error("export build failed");
}

async function runMediaCleanup(env: ApiEnv): Promise<void> {
  try {
    const summary = await createMediaCleanupDispatcherForEnv(env)?.dispatchScheduled();
    if (summary && summary.claimed > 0) console.info("media cleanup", summary);
  } catch {
    console.error("media cleanup failed");
  }
}
