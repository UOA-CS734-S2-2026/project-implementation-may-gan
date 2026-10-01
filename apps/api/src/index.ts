import { createAppForEnv, app } from "./app";
import type { ApiEnv } from "./env";
import { createMessagingDeliveryDispatcher } from "./infrastructure/jobs/messaging-delivery-runtime";
import { withHyperdriveDatabase } from "./infrastructure/database/hyperdrive";
import { readR2RuntimeConfiguration } from "./infrastructure/media/r2";
import { createR2ExportObjectStore } from "./features/data-export/build-export/export-r2-object-store";
import { runOneDataExport } from "./features/data-export/build-export/export-worker.runtime";
import { runOneDataExportCleanup } from "./features/data-export/build-export/export-cleanup.runtime";

export { app };
export { HyperdriveIntegrationEntrypoint } from "./features/system/hyperdrive/integration-entrypoint";
export { UserRealtime } from "./infrastructure/realtime/user-realtime";

export default {
  fetch(request: Request, env: ApiEnv, context: ExecutionContext): Response | Promise<Response> {
    return createAppForEnv(env).fetch(request, env, context);
  },
  scheduled(_event: ScheduledEvent, env: ApiEnv, context: ExecutionContext): void {
    // Scheduled repair owns a fresh database client. It never reuses request-scoped state.
    if (env.USER_REALTIME) context.waitUntil(createMessagingDeliveryDispatcher({ ...env, USER_REALTIME: env.USER_REALTIME }).dispatchScheduled());
    const r2 = readR2RuntimeConfiguration(env);
    if (env.DATA_EXPORT_WORKER_ENABLED === "true" && env.DATA_EXPORT_WORKER_HYPERDRIVE && r2) {
      const objects = createR2ExportObjectStore(r2);
      context.waitUntil(withHyperdriveDatabase(env.DATA_EXPORT_WORKER_HYPERDRIVE, async (database) => {
        await runOneDataExport(database, objects);
        await runOneDataExportCleanup(database, objects);
      }));
    }
  },
};
