import { createRoute, type OpenAPIHono } from "@hono/zod-openapi";
import type { AuthenticatedApiEnv } from "../../../../http/authenticated-actor";
import { messagingReadErrors, unreadSchema } from "../../shared/conversation.contract";
import { MessagingError } from "../../shared/messaging-error";
import { messagingFailure, messagingUnavailable } from "../../shared/messaging-route";
import type { ConversationReader } from "../../shared/conversation-types";

export interface GetMessagingUnreadRouteDependencies {
  reader?: Pick<ConversationReader, "unread">;
}

const security: Array<Record<string, string[]>> = [{ BearerAuth: [] }, { cookieAuth: [] }];
const route = createRoute({
  method: "get",
  path: "/api/v1/messaging/unread",
  tags: ["Messaging"],
  operationId: "getMessagingUnread",
  security,
  responses: {
    200: { description: "Incoming unread message totals.", content: { "application/json": { schema: unreadSchema } } },
    ...messagingReadErrors,
  },
});

export function registerGetMessagingUnreadRoute(
  app: OpenAPIHono<AuthenticatedApiEnv>,
  dependencies: GetMessagingUnreadRouteDependencies,
) {
  app.openapi(route, async (context) => {
    context.header("Cache-Control", "no-store");
    if (!dependencies.reader) return messagingUnavailable(context);
    try {
      return context.json(await dependencies.reader.unread(context.get("actor").userId), 200);
    } catch (error) {
      if (error instanceof MessagingError) return messagingFailure(context, error);
      throw error;
    }
  });
}
