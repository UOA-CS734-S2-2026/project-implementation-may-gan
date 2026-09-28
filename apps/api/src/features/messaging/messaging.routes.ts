import type { OpenAPIHono } from "@hono/zod-openapi";
import type { AuthenticatedApiEnv } from "../../http/authenticated-actor";
import { registerSendMessageRoute, type SendMessageRouteDependencies } from "./messages/send-message/send-message.route";
import { registerMessageActionsRoutes, type MessageActionsRouteDependencies } from "./messages/message-actions.route";
import { registerConversationRoutes, type ConversationRouteDependencies } from "./conversations/conversation.route";

/** Feature composition stays injectable so createApp remains database-free. */
export interface MessagingRouteDependencies extends SendMessageRouteDependencies, MessageActionsRouteDependencies, ConversationRouteDependencies {}

export function registerMessagingRoutes(app: OpenAPIHono<AuthenticatedApiEnv>, dependencies: MessagingRouteDependencies) {
  registerSendMessageRoute(app, dependencies);
  registerMessageActionsRoutes(app, dependencies);
  registerConversationRoutes(app, dependencies);
}
