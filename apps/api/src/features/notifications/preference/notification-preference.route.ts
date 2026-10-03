import { createRoute, z, type OpenAPIHono } from "@hono/zod-openapi";
import { apiErrorResponse } from "../../../http/api-error";
import type { AuthenticatedApiEnv } from "../../../http/authenticated-actor";
import type { NotificationPreferenceStore } from "./notification-preference.repository";

export interface NotificationPreferenceRouteDependencies {
  store?: NotificationPreferenceStore;
}

const preference = z.object({ enabled: z.boolean() });
const security: Array<Record<string, string[]>> = [{ BearerAuth: [] }, { cookieAuth: [] }];
const responses = {
  200: {
    description: "The owner's global mobile notification preference.",
    content: { "application/json": { schema: preference } },
  },
  401: { description: "Unauthenticated." },
  503: { description: "Notification preference storage unavailable." },
};
const getRoute = createRoute({
  method: "get",
  path: "/api/v1/notifications/preference",
  tags: ["Notifications"],
  operationId: "getNotificationPreference",
  security,
  responses,
});
const putRoute = createRoute({
  method: "put",
  path: "/api/v1/notifications/preference",
  tags: ["Notifications"],
  operationId: "updateNotificationPreference",
  security,
  request: { body: { required: true, content: { "application/json": { schema: preference.strict() } } } },
  responses,
});

export function registerNotificationPreferenceRoutes(
  app: OpenAPIHono<AuthenticatedApiEnv>,
  dependencies: NotificationPreferenceRouteDependencies,
) {
  app.openapi(getRoute, async (context) => {
    context.header("Cache-Control", "no-store");
    if (!dependencies.store) return apiErrorResponse(context, 503, "SERVICE_UNAVAILABLE", "Notification preferences are temporarily unavailable.") as never;
    return context.json({ enabled: await dependencies.store.read(context.get("actor").userId) }, 200);
  });
  app.openapi(putRoute, async (context) => {
    context.header("Cache-Control", "no-store");
    if (!dependencies.store) return apiErrorResponse(context, 503, "SERVICE_UNAVAILABLE", "Notification preferences are temporarily unavailable.") as never;
    const enabled = await dependencies.store.write(context.get("actor").userId, context.req.valid("json").enabled);
    return context.json({ enabled }, 200);
  });
}
