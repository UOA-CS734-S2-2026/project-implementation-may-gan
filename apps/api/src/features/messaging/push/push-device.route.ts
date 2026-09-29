import { createRoute, z, type OpenAPIHono } from "@hono/zod-openapi";
import { apiErrorResponse } from "../../../http/api-error";
import type { AuthenticatedApiEnv } from "../../../http/authenticated-actor";
import { createRequireSession, type ResolveSession } from "../../../http/middleware/require-session";
import { usernameSetupStatus, type HasUsername } from "../../../http/middleware/require-username";
import { PushSessionInactiveError, type VerifiedPushSession } from "./push-device.service";

export interface PushDeviceRouteDependencies {
  resolveSession: ResolveSession;
  resolvePushSession(request: Request): Promise<VerifiedPushSession | null>;
  devices?: {
    register(session: VerifiedPushSession, device: { installationId: string; platform: "ios" | "android"; token: string; optedIn: boolean }): Promise<void>;
    unregister(session: VerifiedPushSession, installationId: string): Promise<void>;
  };
  hasUsername?: HasUsername;
}

const installationParams = z.object({ installationId: z.string().min(1).max(128) });
const registerBody = z.object({ token: z.string().min(16).max(8192), platform: z.enum(["ios", "android"]), optedIn: z.boolean() }).strict();
const security: Array<Record<string, string[]>> = [{ BearerAuth: [] }, { cookieAuth: [] }];
const registerRoute = createRoute({
  method: "put", path: "/api/v1/push/devices/{installationId}", tags: ["Messaging"], operationId: "registerPushDevice", security,
  request: { params: installationParams, body: { required: true, content: { "application/json": { schema: registerBody } } } },
  responses: { 204: { description: "Device registration updated." }, 401: { description: "Unauthenticated." }, 403: { description: "Username setup is required." }, 503: { description: "Push registration unavailable." } },
});
const unregisterRoute = createRoute({
  method: "delete", path: "/api/v1/push/devices/{installationId}", tags: ["Messaging"], operationId: "unregisterPushDevice", security,
  request: { params: installationParams }, responses: { 204: { description: "Device registration removed." }, 401: { description: "Unauthenticated." }, 403: { description: "Username setup is required." }, 503: { description: "Push registration unavailable." } },
});

export function registerPushDeviceRoutes(app: OpenAPIHono<AuthenticatedApiEnv>, dependencies: PushDeviceRouteDependencies) {
  app.use("/api/v1/push/devices/*", createRequireSession(dependencies.resolveSession));
  app.openapi(registerRoute, async (context) => {
    context.header("Cache-Control", "no-store");
    const usernameStatus = await usernameSetupStatus(dependencies.hasUsername, context.get("actor").userId);
    if (usernameStatus === "unavailable") return apiErrorResponse(context, 503, "SERVICE_UNAVAILABLE", "Username setup is temporarily unavailable.") as never;
    if (usernameStatus === "missing") return apiErrorResponse(context, 403, "FORBIDDEN", "Choose a username before using messaging.") as never;
    if (!dependencies.devices) return apiErrorResponse(context, 503, "SERVICE_UNAVAILABLE", "Push registration is temporarily unavailable.") as never;
    const session = await dependencies.resolvePushSession(context.req.raw);
    if (!session || session.userId !== context.get("actor").userId) return apiErrorResponse(context, 401, "UNAUTHENTICATED", "Authentication is required.") as never;
    try {
      await dependencies.devices.register(session, { installationId: context.req.valid("param").installationId, ...context.req.valid("json") });
    } catch (error) {
      if (error instanceof PushSessionInactiveError) return apiErrorResponse(context, 401, "UNAUTHENTICATED", "Authentication is required.") as never;
      throw error;
    }
    return context.body(null, 204);
  });
  app.openapi(unregisterRoute, async (context) => {
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
