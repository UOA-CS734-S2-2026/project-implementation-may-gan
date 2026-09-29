import { createRoute, type OpenAPIHono } from "@hono/zod-openapi";
import type { AuthenticatedApiEnv } from "../../../../http/authenticated-actor";
import { directConversationBodySchema, directConversationResponseSchema, messagingReadErrors } from "../../shared/conversation.contract";
import { MessagingError } from "../../shared/messaging-error";
import { messagingFailure, messagingUnavailable } from "../../shared/messaging-route";
import { scheduleImmediateDispatch, type ImmediateDispatchDependencies } from "../../shared/immediate-dispatch";
import type { CreateDirectConversationService } from "./create-direct-conversation.service";

export interface CreateDirectConversationRouteDependencies extends ImmediateDispatchDependencies {
  direct?: CreateDirectConversationService;
}

const security: Array<Record<string, string[]>> = [{ BearerAuth: [] }, { cookieAuth: [] }];
const route = createRoute({
  method: "post",
  path: "/api/v1/conversations/direct",
  tags: ["Messaging"],
  operationId: "createDirectConversation",
  security,
  request: { body: { required: true, content: { "application/json": { schema: directConversationBodySchema } } } },
  responses: {
    201: { description: "Created direct conversation and initial message.", content: { "application/json": { schema: directConversationResponseSchema } } },
    200: { description: "Identical replay.", content: { "application/json": { schema: directConversationResponseSchema } } },
    ...messagingReadErrors,
  },
});

export function registerCreateDirectConversationRoute(
  app: OpenAPIHono<AuthenticatedApiEnv>,
  dependencies: CreateDirectConversationRouteDependencies,
) {
  app.openapi(route, async (context) => {
    context.header("Cache-Control", "no-store");
    if (!dependencies.direct) return messagingUnavailable(context);
    try {
      const result = await dependencies.direct.create(context.get("actor").userId, context.req.valid("json"));
      scheduleImmediateDispatch(context, dependencies);
      return context.json({
        conversation: {
          id: result.conversation.id,
          peer: { id: result.conversation.peerId, name: null },
          requestState: result.conversation.requestState,
        },
        message: result.message,
      }, result.replayed ? 200 : 201);
    } catch (error) {
      if (error instanceof MessagingError) return messagingFailure(context, error);
      throw error;
    }
  });
}
