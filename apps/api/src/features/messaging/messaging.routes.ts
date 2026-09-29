import type { OpenAPIHono } from "@hono/zod-openapi";
import type { AuthenticatedApiEnv } from "../../http/authenticated-actor";
import { createRequireSession } from "../../http/middleware/require-session";
import { createRequireUsername, type HasUsername } from "../../http/middleware/require-username";
import { registerCreateDirectConversationRoute, type CreateDirectConversationRouteDependencies } from "./conversations/create-direct-conversation/create-direct-conversation.route";
import { registerGetConversationRoute, type GetConversationRouteDependencies } from "./conversations/get-conversation/get-conversation.route";
import { registerGetMessageRoute, type GetMessageRouteDependencies } from "./messages/get-message/get-message.route";
import { registerGetMessagingUnreadRoute, type GetMessagingUnreadRouteDependencies } from "./conversations/get-messaging-unread/get-messaging-unread.route";
import { registerListConversationChangesRoute, type ListConversationChangesRouteDependencies } from "./conversations/list-conversation-changes/list-conversation-changes.route";
import { registerListConversationsRoute, type ListConversationsRouteDependencies } from "./conversations/list-conversations/list-conversations.route";
import { registerListMessagesRoute, type ListMessagesRouteDependencies } from "./messages/list-messages/list-messages.route";
import { registerMarkConversationReadRoute, type MarkConversationReadRouteDependencies } from "./conversations/mark-conversation-read/mark-conversation-read.route";
import { registerResolveMessageRequestRoute, type ResolveMessageRequestRouteDependencies } from "./conversations/resolve-message-request/resolve-message-request.route";
import { registerEditMessageRoute, type EditMessageRouteDependencies } from "./messages/edit-message/edit-message.route";
import { registerRemoveReactionRoute, type RemoveReactionRouteDependencies } from "./messages/remove-reaction/remove-reaction.route";
import { registerSendMessageRoute, type SendMessageRouteDependencies } from "./messages/send-message/send-message.route";
import { registerSetReactionRoute, type SetReactionRouteDependencies } from "./messages/set-reaction/set-reaction.route";
import { registerUnsendMessageRoute, type UnsendMessageRouteDependencies } from "./messages/unsend-message/unsend-message.route";
import {
  registerRegisterDeviceRoute,
  type RegisterDeviceRouteDependencies,
} from "./push/register-device/register-device.route";
import {
  registerUnregisterDeviceRoute,
  type UnregisterDeviceRouteDependencies,
} from "./push/unregister-device/unregister-device.route";
import { registerConnectRealtimeRoute } from "./realtime/connect/connect.route";
import type { RealtimeConnectRouteDependencies } from "./realtime/connect/connect.route";
import { registerIssueRealtimeTicketRoute } from "./realtime/issue-ticket/issue-ticket.route";
import type { RealtimeTicketRouteDependencies } from "./realtime/issue-ticket/issue-ticket.route";
/** Feature composition stays injectable so createApp remains database-free. */
export interface MessagingRouteDependencies extends
  SendMessageRouteDependencies,
  EditMessageRouteDependencies,
  UnsendMessageRouteDependencies,
  SetReactionRouteDependencies,
  RemoveReactionRouteDependencies,
  CreateDirectConversationRouteDependencies,
  GetConversationRouteDependencies,
  GetMessagingUnreadRouteDependencies,
  ListConversationChangesRouteDependencies,
  GetMessageRouteDependencies,
  ListConversationsRouteDependencies,
  ListMessagesRouteDependencies,
  MarkConversationReadRouteDependencies,
  ResolveMessageRequestRouteDependencies {
  /** Blocks all conversation reads and mutations until setup is complete. */
  hasUsername?: HasUsername;
  direct?: CreateDirectConversationRouteDependencies["direct"];
  realtimeTicket?: RealtimeTicketRouteDependencies;
  pushDevices?: RegisterDeviceRouteDependencies & UnregisterDeviceRouteDependencies;
  realtimeConnect?: RealtimeConnectRouteDependencies;
}

export function registerMessagingRoutes(
  app: OpenAPIHono<AuthenticatedApiEnv>,
  dependencies: MessagingRouteDependencies,
) {
  for (const path of ["/api/v1/conversations", "/api/v1/conversations/*", "/api/v1/messaging/*"]) {
    app.use(path, createRequireSession(dependencies.resolveSession));
    app.use(path, createRequireUsername(dependencies.hasUsername));
  }
  if (dependencies.realtimeTicket) {
    app.use("/api/v1/realtime/tickets", createRequireSession(dependencies.realtimeTicket.resolveSession));
  }
  if (dependencies.pushDevices) {
    app.use("/api/v1/push/devices/*", createRequireSession(dependencies.pushDevices.resolveSession));
  }

  registerSendMessageRoute(app, dependencies);
  registerEditMessageRoute(app, dependencies);
  registerUnsendMessageRoute(app, dependencies);
  registerSetReactionRoute(app, dependencies);
  registerRemoveReactionRoute(app, dependencies);

  registerCreateDirectConversationRoute(app, dependencies);
  registerListConversationsRoute(app, dependencies);
  registerGetConversationRoute(app, dependencies);
  registerGetMessagingUnreadRoute(app, dependencies);
  registerListMessagesRoute(app, dependencies);
  registerGetMessageRoute(app, dependencies);
  registerResolveMessageRequestRoute(app, dependencies);
  registerMarkConversationReadRoute(app, dependencies);
  registerListConversationChangesRoute(app, dependencies);

  if (dependencies.realtimeTicket) registerIssueRealtimeTicketRoute(app, dependencies.realtimeTicket);
  if (dependencies.pushDevices) {
    registerRegisterDeviceRoute(app, dependencies.pushDevices);
    registerUnregisterDeviceRoute(app, dependencies.pushDevices);
  }
  if (dependencies.realtimeConnect) registerConnectRealtimeRoute(app, dependencies.realtimeConnect);
}
