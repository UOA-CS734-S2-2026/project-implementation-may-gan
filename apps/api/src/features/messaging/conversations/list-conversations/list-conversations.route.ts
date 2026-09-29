import { createRoute, type OpenAPIHono } from "@hono/zod-openapi";
import type { AuthenticatedApiEnv } from "../../../../http/authenticated-actor";
import { conversationFolderSchema, conversationListSchema, messagingReadErrors } from "../../shared/conversation.contract";
import { MessagingError } from "../../shared/messaging-error";
import { messagingFailure, messagingUnavailable } from "../../shared/messaging-route";
import type { ListConversationsRepository } from "./list-conversations.repository";

export interface ListConversationsRouteDependencies {
  listConversations?: ListConversationsRepository;
}

const security: Array<Record<string, string[]>> = [{ BearerAuth: [] }, { cookieAuth: [] }];
const route = createRoute({
  method: "get",
  path: "/api/v1/conversations",
  tags: ["Messaging"],
  operationId: "listConversations",
  security,
  request: { query: conversationFolderSchema },
  responses: {
    200: { description: "Authorized inbox page.", content: { "application/json": { schema: conversationListSchema } } },
    ...messagingReadErrors,
  },
});

export function registerListConversationsRoute(
  app: OpenAPIHono<AuthenticatedApiEnv>,
  dependencies: ListConversationsRouteDependencies,
) {
  app.openapi(route, async (context) => {
    context.header("Cache-Control", "no-store");
    if (!dependencies.listConversations) return messagingUnavailable(context);
    try {
      const query = context.req.valid("query");
      return context.json((await dependencies.listConversations.list(
        context.get("actor").userId,
        query.folder,
        query.cursor,
        query.limit,
      )) as never, 200);
    } catch (error) {
      if (error instanceof MessagingError) return messagingFailure(context, error);
      throw error;
    }
  });
}
