import { createRoute, z, type OpenAPIHono } from "@hono/zod-openapi";
import { apiErrorResponse } from "../../../../http/api-error";
import type { AuthenticatedApiEnv } from "../../../../http/authenticated-actor";
import type { PushDeviceRouteDependencies } from "../shared/push-device-route-dependencies";

const installationParams = z.object({ installationId: z.string().min(1).max(128) });
const security: Array<Record<string, string[]>> = [{ BearerAuth: [] }, { cookieAuth: [] }];
const route = createRoute({
  method: "delete",
  path: "/api/v1/push/devices/{installationId}",
  tags: ["Messaging"],
  operationId: "unregisterPushDevice",
  security,
  request: { params: installationParams },
  responses: {
    204: { description: "Device registration removed." },
    401: { description: "Unauthenticated." },
    503: { description: "Push registration unavailable." },
  },
});

export function registerUnregisterDeviceRoute(
  app: OpenAPIHono<AuthenticatedApiEnv>,
  dependencies: PushDeviceRouteDependencies,
) {
  app.openapi(route, async (context) => {
    context.header("Cache-Control", "no-store");
    if (!dependencies.devices) return apiErrorResponse(context, 503, "SERVICE_UNAVAILABLE", "Push registration is temporarily unavailable.") as never;
    const session = await dependencies.resolvePushSession(context.req.raw);
    if (!session || session.userId !== context.get("actor").userId) return apiErrorResponse(context, 401, "UNAUTHENTICATED", "Authentication is required.") as never;
    await dependencies.devices.unregister(session, context.req.valid("param").installationId);
    return context.body(null, 204);
  });
}