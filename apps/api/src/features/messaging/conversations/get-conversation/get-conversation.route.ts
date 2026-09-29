import { createRoute, type OpenAPIHono } from "@hono/zod-openapi";
import type { AuthenticatedApiEnv } from "../../../../http/authenticated-actor";
import { conversationParamsSchema, conversationSchema, messagingReadErrors } from "../../shared/conversation.contract";
import { MessagingError } from "../../shared/messaging-error";
import { messagingFailure, messagingUnavailable } from "../../shared/messaging-route";
import type { ConversationReader } from "../../shared/conversation-types";

export interface GetConversationRouteDependencies {
  reader?: Pick<ConversationReader, "get">;
}

const security: Array<Record<string, string[]>> = [{ BearerAuth: [] }, { cookieAuth: [] }];
const route = createRoute({
  method: "get",
  path: "/api/v1/conversations/{conversationId}",
  tags: ["Messaging"],
  operationId: "getConversation",
  security,
  request: { params: conversationParamsSchema },
  responses: {
    200: { description: "Conversation state.", content: { "application/json": { schema: conversationSchema } } },
    ...messagingReadErrors,
  },
});

export function registerGetConversationRoute(
  app: OpenAPIHono<AuthenticatedApiEnv>,
  dependencies: GetConversationRouteDependencies,
) {
  app.openapi(route, async (context) => {
    context.header("Cache-Control", "no-store");
    if (!dependencies.reader) return messagingUnavailable(context);
    try {
      return context.json((await dependencies.reader.get(
        context.get("actor").userId,
        context.req.valid("param").conversationId,
      )) as never, 200);
    } catch (error) {
      if (error instanceof MessagingError) return messagingFailure(context, error);
      throw error;
    }
  });
}
