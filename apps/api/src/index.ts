import { createAppForEnv, app } from "./app";
import type { ApiEnv } from "./env";

export { app };
export { HyperdriveIntegrationEntrypoint } from "./features/system/hyperdrive/integration-entrypoint";

export default {
  fetch(request: Request, env: ApiEnv): Response | Promise<Response> {
    return createAppForEnv(env).fetch(request);
  },
};
