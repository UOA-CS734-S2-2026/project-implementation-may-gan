import type { OpenAPIHono } from "@hono/zod-openapi";
import type { AuthenticatedApiEnv } from "../../http/authenticated-actor";
import { registerSendMessageRoute, type SendMessageRouteDependencies } from "./messages/send-message/send-message.route";

/** Feature composition stays injectable so createApp remains database-free. */
export interface MessagingRouteDependencies extends SendMessageRouteDependencies {}

export function registerMessagingRoutes(app: OpenAPIHono<AuthenticatedApiEnv>, dependencies: MessagingRouteDependencies) {
  registerSendMessageRoute(app, dependencies);
}
