import { createRoute, type OpenAPIHono } from "@hono/zod-openapi";
import type { AuthenticatedApiEnv } from "../../../../http/authenticated-actor";
import { messagingReadErrors } from "../../shared/conversation.contract";
import { messageParamsSchema, messageSchema } from "../../shared/message.contract";
import { MessagingError } from "../../shared/messaging-error";
import { messagingFailure, messagingUnavailable } from "../../shared/messaging-route";
import type { GetMessageRepository } from "./get-message.repository";

export interface GetMessageRouteDependencies {
  getMessage?: GetMessageRepository;
}

const security: Array<Record<string, string[]>> = [{ BearerAuth: [] }, { cookieAuth: [] }];
const route = createRoute({
  method: "get",
  path: "/api/v1/conversations/{conversationId}/messages/{messageId}",
  tags: ["Messaging"],
  operationId: "getMessage",
  security,
  request: { params: messageParamsSchema },
  responses: {
    200: { description: "Canonical message.", content: { "application/json": { schema: messageSchema } } },
    ...messagingReadErrors,
  },
});

export function registerGetMessageRoute(
  app: OpenAPIHono<AuthenticatedApiEnv>,
  dependencies: GetMessageRouteDependencies,
) {
  app.openapi(route, async (context) => {
    context.header("Cache-Control", "no-store");
    if (!dependencies.getMessage) return messagingUnavailable(context);
    try {
      const params = context.req.valid("param");
      return context.json(await dependencies.getMessage.get(
        context.get("actor").userId,
        params.conversationId,
        params.messageId,
      ), 200);
    } catch (error) {
      if (error instanceof MessagingError) return messagingFailure(context, error);
      throw error;
    }
  });
}
