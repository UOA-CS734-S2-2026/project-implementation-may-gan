import type { OpenAPIHono } from "@hono/zod-openapi";
import type { AuthenticatedApiEnv } from "../../http/authenticated-actor";
import { createRequireSession } from "../../http/middleware/require-session";
import { createRequireUsername, type HasUsername } from "../../http/middleware/require-username";
import { registerSendMessageRoute, type SendMessageRouteDependencies } from "./messages/send-message/send-message.route";
import { registerMessageActionsRoutes, type MessageActionsRouteDependencies } from "./messages/message-actions.route";
import { registerConversationRoutes, type ConversationRouteDependencies } from "./conversations/conversation.route";

/** Feature composition stays injectable so createApp remains database-free. */
export interface MessagingRouteDependencies extends SendMessageRouteDependencies, MessageActionsRouteDependencies, ConversationRouteDependencies {
  /** Blocks all conversation reads and mutations until setup is complete. */
  hasUsername?: HasUsername;
}

export function registerMessagingRoutes(app: OpenAPIHono<AuthenticatedApiEnv>, dependencies: MessagingRouteDependencies) {
  for (const path of ["/api/v1/conversations", "/api/v1/conversations/*", "/api/v1/messaging/*"]) {
    app.use(path, createRequireSession(dependencies.resolveSession));
    app.use(path, createRequireUsername(dependencies.hasUsername));
  }
  registerSendMessageRoute(app, dependencies);
  registerMessageActionsRoutes(app, dependencies);
  registerConversationRoutes(app, dependencies);
}
