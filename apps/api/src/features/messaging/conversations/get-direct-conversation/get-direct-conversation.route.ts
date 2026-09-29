import { createRoute, type OpenAPIHono } from "@hono/zod-openapi";
import type { AuthenticatedApiEnv } from "../../../../http/authenticated-actor";
import { directPairLookupSchema, directPairParamsSchema, messagingReadErrors } from "../../shared/conversation.contract";
import { MessagingError } from "../../shared/messaging-error";
import { messagingFailure, messagingUnavailable } from "../../shared/messaging-route";
import type { GetDirectConversationRepository } from "./get-direct-conversation.repository";

export interface GetDirectConversationRouteDependencies {
  findDirectConversation?: GetDirectConversationRepository;
}

const security: Array<Record<string, string[]>> = [{ BearerAuth: [] }, { cookieAuth: [] }];
const route = createRoute({
  method: "get",
  path: "/api/v1/conversations/direct/{recipientId}",
  tags: ["Messaging"],
  operationId: "findDirectConversation",
  security,
  request: { params: directPairParamsSchema },
  responses: {
    200: { description: "Authorized existing direct thread ID.", content: { "application/json": { schema: directPairLookupSchema } } },
    ...messagingReadErrors,
  },
});

export function registerGetDirectConversationRoute(
  app: OpenAPIHono<AuthenticatedApiEnv>,
  dependencies: GetDirectConversationRouteDependencies,
) {
  app.openapi(route, async (context) => {
    context.header("Cache-Control", "no-store");
    if (!dependencies.findDirectConversation) return messagingUnavailable(context);
    try {
      return context.json(await dependencies.findDirectConversation.find(
        context.get("actor").userId,
        context.req.valid("param").recipientId,
      ), 200);
    } catch (error) {
      if (error instanceof MessagingError) return messagingFailure(context, error);
      throw error;
    }
  });
}
