import { createRoute, type OpenAPIHono } from "@hono/zod-openapi";
import type { AuthenticatedApiEnv } from "../../../../http/authenticated-actor";
import { conversationParamsSchema, messageListSchema, messagesQuerySchema, messagingReadErrors } from "../../shared/conversation.contract";
import { MessagingError } from "../../shared/messaging-error";
import { messagingFailure, messagingUnavailable } from "../../shared/messaging-route";
import type { ListMessagesRepository } from "./list-messages.repository";

export interface ListMessagesRouteDependencies {
  listMessages?: ListMessagesRepository;
}

const security: Array<Record<string, string[]>> = [{ BearerAuth: [] }, { cookieAuth: [] }];
const route = createRoute({
  method: "get",
  path: "/api/v1/conversations/{conversationId}/messages",
  tags: ["Messaging"],
  operationId: "listMessages",
  security,
  request: { params: conversationParamsSchema, query: messagesQuerySchema },
  responses: {
    200: { description: "Authorized history page.", content: { "application/json": { schema: messageListSchema } } },
    ...messagingReadErrors,
  },
});

export function registerListMessagesRoute(
  app: OpenAPIHono<AuthenticatedApiEnv>,
  dependencies: ListMessagesRouteDependencies,
) {
  app.openapi(route, async (context) => {
    context.header("Cache-Control", "no-store");
    if (!dependencies.listMessages) return messagingUnavailable(context);
    try {
      const params = context.req.valid("param");
      const query = context.req.valid("query");
      return context.json(await dependencies.listMessages.list(
        context.get("actor").userId,
        params.conversationId,
        query.beforeSequence,
        query.afterSequence,
        query.limit,
      ), 200);
    } catch (error) {
      if (error instanceof MessagingError) return messagingFailure(context, error);
      throw error;
    }
  });
}
