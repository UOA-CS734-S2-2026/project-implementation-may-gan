import { createRoute, type OpenAPIHono } from "@hono/zod-openapi";
import type { AuthenticatedApiEnv } from "../../../../http/authenticated-actor";
import { messageParamsSchema, messageSchema, messagingErrorResponses } from "../../shared/message.contract";
import { MessagingError } from "../../shared/messaging-error";
import { messagingFailure, messagingUnavailable } from "../../shared/messaging-route";
import { scheduleImmediateDispatch, type ImmediateDispatchDependencies } from "../../shared/immediate-dispatch";
import type { RemoveReactionService } from "./remove-reaction.service";

export interface RemoveReactionRouteDependencies extends ImmediateDispatchDependencies {
  removeReaction?: RemoveReactionService;
}

const security: Array<Record<string, string[]>> = [{ BearerAuth: [] }, { cookieAuth: [] }];
const route = createRoute({
  method: "delete",
  path: "/api/v1/conversations/{conversationId}/messages/{messageId}/reaction",
  tags: ["Messaging"],
  operationId: "removeMessageReaction",
  security,
  request: { params: messageParamsSchema },
  responses: {
    200: { description: "Updated canonical message.", content: { "application/json": { schema: messageSchema } } },
    ...messagingErrorResponses,
  },
});

export function registerRemoveReactionRoute(
  app: OpenAPIHono<AuthenticatedApiEnv>,
  dependencies: RemoveReactionRouteDependencies,
) {
  app.openapi(route, async (context) => {
    context.header("Cache-Control", "no-store");
    if (!dependencies.removeReaction) return messagingUnavailable(context);
    try {
      const params = context.req.valid("param");
      const result = await dependencies.removeReaction.remove(
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
