import { createRoute, z, type OpenAPIHono } from "@hono/zod-openapi";
import { apiErrorResponse } from "../../../../http/api-error";
import type { AuthenticatedApiEnv } from "../../../../http/authenticated-actor";
import { usernameSetupStatus } from "../../../../http/middleware/require-username";
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
    403: { description: "Username setup is required." },
    503: { description: "Push registration unavailable." },
  },
});

export function registerUnregisterDeviceRoute(
  app: OpenAPIHono<AuthenticatedApiEnv>,
  dependencies: PushDeviceRouteDependencies,
) {
  app.openapi(route, async (context) => {
    context.header("Cache-Control", "no-store");
    const usernameStatus = await usernameSetupStatus(dependencies.hasUsername, context.get("actor").userId);
    if (usernameStatus === "unavailable") return apiErrorResponse(context, 503, "SERVICE_UNAVAILABLE", "Username setup is temporarily unavailable.") as never;
    if (usernameStatus === "missing") return apiErrorResponse(context, 403, "FORBIDDEN", "Choose a username before using messaging.") as never;
    if (!dependencies.devices) return apiErrorResponse(context, 503, "SERVICE_UNAVAILABLE", "Push registration is temporarily unavailable.") as never;
    const session = await dependencies.resolvePushSession(context.req.raw);
    if (!session || session.userId !== context.get("actor").userId) return apiErrorResponse(context, 401, "UNAUTHENTICATED", "Authentication is required.") as never;
    await dependencies.devices.unregister(session, context.req.valid("param").installationId);
    return context.body(null, 204);
  });
}