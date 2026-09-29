import { createRoute, type OpenAPIHono } from "@hono/zod-openapi";
import type { AuthenticatedApiEnv } from "../../../../http/authenticated-actor";
import type { ResolveSession } from "../../../../http/middleware/require-session";
import { messagingErrorResponses, conversationParamsSchema, messageSchema, sendMessageBodySchema } from "../../shared/message.contract";
import { MessagingError } from "../../shared/messaging-error";
import { messagingFailure, messagingUnavailable } from "../../shared/messaging-route";
import type { SendMessageService } from "./send-message.service";
import { scheduleImmediateDispatch, type ImmediateDispatchDependencies } from "../../shared/immediate-dispatch";

export interface SendMessageRouteDependencies extends ImmediateDispatchDependencies { resolveSession: ResolveSession; service?: SendMessageService }
const security: Array<Record<string, string[]>> = [{ BearerAuth: [] }, { cookieAuth: [] }];
const route = createRoute({
  method: "post", path: "/api/v1/conversations/{conversationId}/messages", tags: ["Messaging"], operationId: "sendMessage", security,
  request: { params: conversationParamsSchema, body: { required: true, content: { "application/json": { schema: sendMessageBodySchema } } } },
  responses: { 201: { description: "Saved message.", content: { "application/json": { schema: messageSchema } } }, 200: { description: "Identical idempotent replay.", content: { "application/json": { schema: messageSchema } } }, ...messagingErrorResponses },
});

export function registerSendMessageRoute(app: OpenAPIHono<AuthenticatedApiEnv>, dependencies: SendMessageRouteDependencies) {
  app.openapi(route, async (context) => {
    context.header("Cache-Control", "no-store");
    if (!dependencies.service) return messagingUnavailable(context);
    try {
      const { conversationId } = context.req.valid("param");
      const result = await dependencies.service.send(context.get("actor").userId, conversationId, context.req.valid("json"));
      scheduleImmediateDispatch(context, dependencies);
      return context.json(result.message, result.replayed ? 200 : 201);
    } catch (error) {
      if (error instanceof MessagingError) return messagingFailure(context, error);
      throw error;
    }
  });
}
