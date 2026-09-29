import { createRoute, type OpenAPIHono } from "@hono/zod-openapi";
import type { AuthenticatedApiEnv } from "../../../../http/authenticated-actor";
import { changesQuerySchema, changesSchema, conversationParamsSchema, messagingReadErrors } from "../../shared/conversation.contract";
import { MessagingError } from "../../shared/messaging-error";
import { messagingFailure, messagingUnavailable } from "../../shared/messaging-route";
import type { ListConversationChangesRepository } from "./list-conversation-changes.repository";

export interface ListConversationChangesRouteDependencies {
  listConversationChanges?: ListConversationChangesRepository;
}

const security: Array<Record<string, string[]>> = [{ BearerAuth: [] }, { cookieAuth: [] }];
const route = createRoute({
  method: "get",
  path: "/api/v1/conversations/{conversationId}/changes",
  tags: ["Messaging"],
  operationId: "listConversationChanges",
  security,
  request: { params: conversationParamsSchema, query: changesQuerySchema },
  responses: {
    200: { description: "Durable changes.", content: { "application/json": { schema: changesSchema } } },
    ...messagingReadErrors,
  },
});

export function registerListConversationChangesRoute(
  app: OpenAPIHono<AuthenticatedApiEnv>,
  dependencies: ListConversationChangesRouteDependencies,
) {
  app.openapi(route, async (context) => {
    context.header("Cache-Control", "no-store");
    if (!dependencies.listConversationChanges) return messagingUnavailable(context);
    try {
      const params = context.req.valid("param");
      const query = context.req.valid("query");
      return context.json((await dependencies.listConversationChanges.list(
        context.get("actor").userId,
        params.conversationId,
        query.afterChangeSequence,
        query.limit,
      )) as never, 200);
    } catch (error) {
      if (error instanceof MessagingError) return messagingFailure(context, error);
      throw error;
    }
  });
}
