import { createAppForEnv, app } from "./app";
import type { ApiEnv } from "./env";
import { createMessagingDeliveryDispatcher } from "./infrastructure/jobs/messaging-delivery-runtime";

export { app };
export { HyperdriveIntegrationEntrypoint } from "./features/system/hyperdrive/integration-entrypoint";
export { UserRealtime } from "./infrastructure/realtime/user-realtime";

export default {
  fetch(request: Request, env: ApiEnv): Response | Promise<Response> {
    return createAppForEnv(env).fetch(request);
  },
  scheduled(_event: ScheduledEvent, env: ApiEnv, context: ExecutionContext): void {
    // Scheduled repair owns a fresh database client. It never reuses request-scoped state.
    if (env.USER_REALTIME) context.waitUntil(createMessagingDeliveryDispatcher({ ...env, USER_REALTIME: env.USER_REALTIME }).dispatchScheduled());
  },
};
