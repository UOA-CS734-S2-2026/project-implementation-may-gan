import { createRoute, type OpenAPIHono } from "@hono/zod-openapi";
import type { AuthenticatedApiEnv } from "../../../../http/authenticated-actor";
import { editMessageBodySchema, messageParamsSchema, messageSchema, messagingErrorResponses } from "../../shared/message.contract";
import { MessagingError } from "../../shared/messaging-error";
import { messagingFailure, messagingUnavailable } from "../../shared/messaging-route";
import { scheduleImmediateDispatch, type ImmediateDispatchDependencies } from "../../shared/immediate-dispatch";
import type { EditMessageService } from "./edit-message.service";

export interface EditMessageRouteDependencies extends ImmediateDispatchDependencies {
  edit?: EditMessageService;
}

const security: Array<Record<string, string[]>> = [{ BearerAuth: [] }, { cookieAuth: [] }];
const route = createRoute({
  method: "patch",
  path: "/api/v1/conversations/{conversationId}/messages/{messageId}",
  tags: ["Messaging"],
  operationId: "editMessage",
  security,
  request: {
    params: messageParamsSchema,
    body: { required: true, content: { "application/json": { schema: editMessageBodySchema } } },
  },
  responses: {
    200: { description: "Updated canonical message.", content: { "application/json": { schema: messageSchema } } },
    ...messagingErrorResponses,
  },
});

export function registerEditMessageRoute(
  app: OpenAPIHono<AuthenticatedApiEnv>,
  dependencies: EditMessageRouteDependencies,
) {
  app.openapi(route, async (context) => {
    context.header("Cache-Control", "no-store");
    if (!dependencies.edit) return messagingUnavailable(context);
    try {
      const params = context.req.valid("param");
      const result = await dependencies.edit.edit(
        context.get("actor").userId,
        params.conversationId,
        params.messageId,
        context.req.valid("json"),
      );
      scheduleImmediateDispatch(context, dependencies);
      return context.json(result, 200);
    } catch (error) {
      if (error instanceof MessagingError) return messagingFailure(context, error);
      throw error;
    }
  });
}
