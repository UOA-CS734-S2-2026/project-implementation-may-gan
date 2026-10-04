import { createRoute, z, type OpenAPIHono } from "@hono/zod-openapi";
import { rateLimitErrorResponse } from "../../../../http/rate-limit-contract";
import { apiErrorResponse } from "../../../../http/api-error";
import type { AuthenticatedApiEnv } from "../../../../http/authenticated-actor";
import { usernameSetupStatus } from "../../../../http/middleware/require-username";
import { PushSessionInactiveError, type RegisterDeviceService } from "./register-device.service";
import type { PushDeviceRouteDependencies } from "../shared/push-device-route-dependencies";

export interface RegisterDeviceRouteDependencies extends PushDeviceRouteDependencies {
  register?: RegisterDeviceService;
}

const installationParams = z.object({ installationId: z.string().min(1).max(128) });
const registerBody = z.object({
  token: z.string().min(16).max(8192),
  platform: z.enum(["ios", "android"]),
  optedIn: z.boolean(),
  notificationSchemaVersion: z.number().int().min(1).max(1).optional(),
}).strict();
const security: Array<Record<string, string[]>> = [{ BearerAuth: [] }, { cookieAuth: [] }];
const route = createRoute({
  method: "put",
  path: "/api/v1/push/devices/{installationId}",
  tags: ["Messaging"],
  operationId: "registerPushDevice",
  security,
  request: {
    params: installationParams,
    body: { required: true, content: { "application/json": { schema: registerBody } } },
  },
  responses: {
    204: { description: "Device registration updated." },
    401: { description: "Unauthenticated." },
    403: { description: "Username setup is required." },
    429: rateLimitErrorResponse,
    503: { description: "Push registration unavailable." },
  },
});

export function registerRegisterDeviceRoute(
  app: OpenAPIHono<AuthenticatedApiEnv>,
  dependencies: RegisterDeviceRouteDependencies,
) {
  app.openapi(route, async (context) => {
    context.header("Cache-Control", "no-store");
    const usernameStatus = await usernameSetupStatus(dependencies.hasUsername, context.get("actor").userId);
    if (usernameStatus === "unavailable") return apiErrorResponse(context, 503, "SERVICE_UNAVAILABLE", "Username setup is temporarily unavailable.") as never;
    if (usernameStatus === "missing") return apiErrorResponse(context, 403, "FORBIDDEN", "Choose a username before using messaging.") as never;
    if (!dependencies.register) return apiErrorResponse(context, 503, "SERVICE_UNAVAILABLE", "Push registration is temporarily unavailable.") as never;
    const session = await dependencies.resolvePushSession(context.req.raw);
    if (!session || session.userId !== context.get("actor").userId) return apiErrorResponse(context, 401, "UNAUTHENTICATED", "Authentication is required.") as never;
    try {
      await dependencies.register.register(session, {
        installationId: context.req.valid("param").installationId,
        ...context.req.valid("json"),
      });
    } catch (error) {
      if (error instanceof PushSessionInactiveError) return apiErrorResponse(context, 401, "UNAUTHENTICATED", "Authentication is required.") as never;
      throw error;
    }
    return context.body(null, 204);
  });
}