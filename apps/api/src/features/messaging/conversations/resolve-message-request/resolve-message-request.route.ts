import { createRoute, type OpenAPIHono } from "@hono/zod-openapi";
import type { AuthenticatedApiEnv } from "../../../../http/authenticated-actor";
import { conversationParamsSchema, conversationSchema, messagingReadErrors, resolveRequestBodySchema } from "../../shared/conversation.contract";
import { MessagingError } from "../../shared/messaging-error";
import { messagingFailure, messagingUnavailable } from "../../shared/messaging-route";
import { scheduleImmediateDispatch, type ImmediateDispatchDependencies } from "../../shared/immediate-dispatch";
import type { ResolveMessageRequestRepository } from "./resolve-message-request.repository";

export interface ResolveMessageRequestRouteDependencies extends ImmediateDispatchDependencies {
  resolveMessageRequest?: ResolveMessageRequestRepository;
}

const security: Array<Record<string, string[]>> = [{ BearerAuth: [] }, { cookieAuth: [] }];
const route = createRoute({
  method: "put",
  path: "/api/v1/conversations/{conversationId}/request",
  tags: ["Messaging"],
  operationId: "resolveMessageRequest",
  security,
  request: {
    params: conversationParamsSchema,
    body: { required: true, content: { "application/json": { schema: resolveRequestBodySchema } } },
  },
  responses: {
    200: { description: "Resolved conversation.", content: { "application/json": { schema: conversationSchema } } },
    ...messagingReadErrors,
  },
});

export function registerResolveMessageRequestRoute(
  app: OpenAPIHono<AuthenticatedApiEnv>,
  dependencies: ResolveMessageRequestRouteDependencies,
) {
  app.openapi(route, async (context) => {
    context.header("Cache-Control", "no-store");
    if (!dependencies.resolveMessageRequest) return messagingUnavailable(context);
    try {
      const params = context.req.valid("param");
      const result = await dependencies.resolveMessageRequest.resolve(
        context.get("actor").userId,
        params.conversationId,
        context.req.valid("json").decision,
      );
      scheduleImmediateDispatch(context, dependencies);
      return context.json(result as never, 200);
    } catch (error) {
      if (error instanceof MessagingError) return messagingFailure(context, error);
      throw error;
    }
  });
}
