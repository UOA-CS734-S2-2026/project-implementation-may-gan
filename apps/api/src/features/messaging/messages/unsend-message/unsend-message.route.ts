import { createRoute, type OpenAPIHono } from "@hono/zod-openapi";
import type { AuthenticatedApiEnv } from "../../../../http/authenticated-actor";
import { messageParamsSchema, messageSchema, messagingErrorResponses } from "../../shared/message.contract";
import { MessagingError } from "../../shared/messaging-error";
import { messagingFailure, messagingUnavailable } from "../../shared/messaging-route";
import { scheduleImmediateDispatch, type ImmediateDispatchDependencies } from "../../shared/immediate-dispatch";
import type { UnsendMessageService } from "./unsend-message.service";

export interface UnsendMessageRouteDependencies extends ImmediateDispatchDependencies {
  unsend?: UnsendMessageService;
}

const security: Array<Record<string, string[]>> = [{ BearerAuth: [] }, { cookieAuth: [] }];
const route = createRoute({
  method: "delete",
  path: "/api/v1/conversations/{conversationId}/messages/{messageId}",
  tags: ["Messaging"],
  operationId: "unsendMessage",
  security,
  request: { params: messageParamsSchema },
  responses: {
    200: { description: "Updated canonical message.", content: { "application/json": { schema: messageSchema } } },
    ...messagingErrorResponses,
  },
});

export function registerUnsendMessageRoute(
  app: OpenAPIHono<AuthenticatedApiEnv>,
  dependencies: UnsendMessageRouteDependencies,
) {
  app.openapi(route, async (context) => {
    context.header("Cache-Control", "no-store");
    if (!dependencies.unsend) return messagingUnavailable(context);
    try {
      const params = context.req.valid("param");
      const result = await dependencies.unsend.unsend(
        context.get("actor").userId,
        params.conversationId,
        params.messageId,
      );
      scheduleImmediateDispatch(context, dependencies);
      return context.json(result.message, 200);
    } catch (error) {
      if (error instanceof MessagingError) return messagingFailure(context, error);
      throw error;
    }
  });
}
