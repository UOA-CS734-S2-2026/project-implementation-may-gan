import { createRoute, type OpenAPIHono } from "@hono/zod-openapi";
import type { AuthenticatedApiEnv } from "../../../../http/authenticated-actor";
import { conversationParamsSchema, markReadBodySchema, messagingReadErrors, readSchema } from "../../shared/conversation.contract";
import { MessagingError } from "../../shared/messaging-error";
import { messagingFailure, messagingUnavailable } from "../../shared/messaging-route";
import { scheduleImmediateDispatch, type ImmediateDispatchDependencies } from "../../shared/immediate-dispatch";
import type { ConversationReader } from "../../shared/conversation-types";

export interface MarkConversationReadRouteDependencies extends ImmediateDispatchDependencies {
  reader?: Pick<ConversationReader, "markRead">;
}

const security: Array<Record<string, string[]>> = [{ BearerAuth: [] }, { cookieAuth: [] }];
const route = createRoute({
  method: "put",
  path: "/api/v1/conversations/{conversationId}/read",
  tags: ["Messaging"],
  operationId: "markConversationRead",
  security,
  request: {
    params: conversationParamsSchema,
    body: { required: true, content: { "application/json": { schema: markReadBodySchema } } },
  },
  responses: {
    200: { description: "Current read positions.", content: { "application/json": { schema: readSchema } } },
    ...messagingReadErrors,
  },
});

export function registerMarkConversationReadRoute(
  app: OpenAPIHono<AuthenticatedApiEnv>,
  dependencies: MarkConversationReadRouteDependencies,
) {
  app.openapi(route, async (context) => {
    context.header("Cache-Control", "no-store");
    if (!dependencies.reader) return messagingUnavailable(context);
    try {
      const params = context.req.valid("param");
      const result = await dependencies.reader.markRead(
        context.get("actor").userId,
        params.conversationId,
        context.req.valid("json").throughSequence,
      );
      scheduleImmediateDispatch(context, dependencies);
      return context.json(result, 200);
    } catch (error) {
      if (error instanceof MessagingError) return messagingFailure(context, error);
      throw error;
    }
  });
}
