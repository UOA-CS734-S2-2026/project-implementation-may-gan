import { createRoute, type OpenAPIHono } from "@hono/zod-openapi";
import { apiErrorResponse } from "../../../../http/api-error";
import type { AuthenticatedApiEnv } from "../../../../http/authenticated-actor";
import { createRequireSession, type ResolveSession } from "../../../../http/require-session";
import { messagingErrorResponses, conversationParamsSchema, messageSchema, sendMessageBodySchema } from "../message.contract";
import { MessagingError } from "../../shared/messaging-error";
import type { SendMessageService } from "./send-message.service";

export interface SendMessageRouteDependencies { resolveSession: ResolveSession; service?: SendMessageService }
const security: Array<Record<string, string[]>> = [{ BearerAuth: [] }, { cookieAuth: [] }];
const route = createRoute({
  method: "post", path: "/api/v1/conversations/{conversationId}/messages", tags: ["Messaging"], operationId: "sendMessage", security,
  request: { params: conversationParamsSchema, body: { required: true, content: { "application/json": { schema: sendMessageBodySchema } } } },
  responses: { 201: { description: "Saved message.", content: { "application/json": { schema: messageSchema } } }, 200: { description: "Identical idempotent replay.", content: { "application/json": { schema: messageSchema } } }, ...messagingErrorResponses },
});

export function registerSendMessageRoute(app: OpenAPIHono<AuthenticatedApiEnv>, dependencies: SendMessageRouteDependencies) {
  app.use("/api/v1/conversations/*", createRequireSession(dependencies.resolveSession));
  app.openapi(route, async (context) => {
    context.header("Cache-Control", "no-store");
    if (!dependencies.service) return apiErrorResponse(context, 503, "SERVICE_UNAVAILABLE", "Messaging is temporarily unavailable.") as never;
    try {
      const { conversationId } = context.req.valid("param");
      const result = await dependencies.service.send(context.get("actor").userId, conversationId, context.req.valid("json"));
      return context.json(result.message, result.replayed ? 200 : 201);
    } catch (error) {
      if (!(error instanceof MessagingError)) throw error;
      const status = error.code === "NOT_FOUND" ? 404 : error.code === "VALIDATION_FAILED" ? 422 : error.code === "BLOCKED" || error.code === "FORBIDDEN" ? 403 : 409;
      return apiErrorResponse(context, status, status === 404 ? "NOT_FOUND" : status === 422 ? "VALIDATION_FAILED" : status === 403 ? "FORBIDDEN" : "CONFLICT", error.message, { reason: error.code }) as never;
    }
  });
}
