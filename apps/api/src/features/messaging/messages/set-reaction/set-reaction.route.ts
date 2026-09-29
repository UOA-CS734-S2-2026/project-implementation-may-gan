import { createRoute, type OpenAPIHono } from "@hono/zod-openapi";
import type { AuthenticatedApiEnv } from "../../../../http/authenticated-actor";
import { messageParamsSchema, messageSchema, messagingErrorResponses, setReactionBodySchema } from "../../shared/message.contract";
import { MessagingError } from "../../shared/messaging-error";
import { messagingFailure, messagingUnavailable } from "../../shared/messaging-route";
import { scheduleImmediateDispatch, type ImmediateDispatchDependencies } from "../../shared/immediate-dispatch";
import type { SetReactionService } from "./set-reaction.service";

export interface SetReactionRouteDependencies extends ImmediateDispatchDependencies {
  setReaction?: SetReactionService;
}

const security: Array<Record<string, string[]>> = [{ BearerAuth: [] }, { cookieAuth: [] }];
const route = createRoute({
  method: "put",
  path: "/api/v1/conversations/{conversationId}/messages/{messageId}/reaction",
  tags: ["Messaging"],
  operationId: "setMessageReaction",
  security,
  request: {
    params: messageParamsSchema,
    body: { required: true, content: { "application/json": { schema: setReactionBodySchema } } },
  },
  responses: {
    200: { description: "Updated canonical message.", content: { "application/json": { schema: messageSchema } } },
    ...messagingErrorResponses,
  },
});

export function registerSetReactionRoute(
  app: OpenAPIHono<AuthenticatedApiEnv>,
  dependencies: SetReactionRouteDependencies,
) {
  app.openapi(route, async (context) => {
    context.header("Cache-Control", "no-store");
    if (!dependencies.setReaction) return messagingUnavailable(context);
    try {
      const params = context.req.valid("param");
      const result = await dependencies.setReaction.set(
        context.get("actor").userId,
        params.conversationId,
        params.messageId,
        context.req.valid("json").reaction,
      );
      scheduleImmediateDispatch(context, dependencies);
      return context.json(result.message, 200);
    } catch (error) {
      if (error instanceof MessagingError) return messagingFailure(context, error);
      throw error;
    }
  });
}
