import { createRoute, z, type OpenAPIHono } from "@hono/zod-openapi";
import { apiErrorResponse } from "../../../../http/api-error";
import type { AuthenticatedApiEnv } from "../../../../http/authenticated-actor";
import { PushSessionInactiveError } from "../shared/push-device.service";
import type { PushDeviceRouteDependencies } from "../shared/push-device-route-dependencies";

const installationParams = z.object({ installationId: z.string().min(1).max(128) });
const registerBody = z.object({
  token: z.string().min(16).max(8192),
  platform: z.enum(["ios", "android"]),
  optedIn: z.boolean(),
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
    503: { description: "Push registration unavailable." },
  },
});

export function registerRegisterDeviceRoute(
  app: OpenAPIHono<AuthenticatedApiEnv>,
  dependencies: PushDeviceRouteDependencies,
) {
  app.openapi(route, async (context) => {
    context.header("Cache-Control", "no-store");
    if (!dependencies.devices) return apiErrorResponse(context, 503, "SERVICE_UNAVAILABLE", "Push registration is temporarily unavailable.") as never;
    const session = await dependencies.resolvePushSession(context.req.raw);
    if (!session || session.userId !== context.get("actor").userId) return apiErrorResponse(context, 401, "UNAUTHENTICATED", "Authentication is required.") as never;
    try {
      await dependencies.devices.register(session, {
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