import { createRoute, type OpenAPIHono } from "@hono/zod-openapi";
import { apiErrorResponse } from "../../../http/api-error";
import type { AuthenticatedApiEnv } from "../../../http/authenticated-actor";
import { createRequireSession, type ResolveSession } from "../../../http/require-session";
import { MessagingError } from "../shared/messaging-error";
import { editMessageBodySchema, messageParamsSchema, messageSchema, messagingErrorResponses, setReactionBodySchema } from "./message.contract";
import type { EditMessageService } from "./edit-message/edit-message.service";
import type { UnsendMessageService } from "./unsend-message/unsend-message.service";
import type { SetReactionService } from "./set-reaction/set-reaction.service";
import type { RemoveReactionService } from "./remove-reaction/remove-reaction.service";

export interface MessageActionsRouteDependencies { resolveSession: ResolveSession; edit?: EditMessageService; unsend?: UnsendMessageService; setReaction?: SetReactionService; removeReaction?: RemoveReactionService }
const security: Array<Record<string, string[]>> = [{ BearerAuth: [] }, { cookieAuth: [] }];
const responses = { 200: { description: "Updated canonical message.", content: { "application/json": { schema: messageSchema } } }, ...messagingErrorResponses };
const editRoute = createRoute({ method: "patch", path: "/api/v1/conversations/{conversationId}/messages/{messageId}", tags: ["Messaging"], operationId: "editMessage", security, request: { params: messageParamsSchema, body: { required: true, content: { "application/json": { schema: editMessageBodySchema } } } }, responses });
const unsendRoute = createRoute({ method: "delete", path: "/api/v1/conversations/{conversationId}/messages/{messageId}", tags: ["Messaging"], operationId: "unsendMessage", security, request: { params: messageParamsSchema }, responses });
const setRoute = createRoute({ method: "put", path: "/api/v1/conversations/{conversationId}/messages/{messageId}/reaction", tags: ["Messaging"], operationId: "setMessageReaction", security, request: { params: messageParamsSchema, body: { required: true, content: { "application/json": { schema: setReactionBodySchema } } } }, responses });
const removeRoute = createRoute({ method: "delete", path: "/api/v1/conversations/{conversationId}/messages/{messageId}/reaction", tags: ["Messaging"], operationId: "removeMessageReaction", security, request: { params: messageParamsSchema }, responses });
function failure(context: Parameters<OpenAPIHono<AuthenticatedApiEnv>["openapi"]>[1] extends (context: infer C, ...x: never[]) => unknown ? C : never, error: MessagingError) { const status = error.code === "NOT_FOUND" ? 404 : error.code === "VALIDATION_FAILED" ? 422 : error.code === "BLOCKED" || error.code === "FORBIDDEN" ? 403 : 409; return apiErrorResponse(context as never, status, status === 404 ? "NOT_FOUND" : status === 422 ? "VALIDATION_FAILED" : status === 403 ? "FORBIDDEN" : "CONFLICT", error.message, { reason: error.code }) as never; }

export function registerMessageActionsRoutes(app: OpenAPIHono<AuthenticatedApiEnv>, dependencies: MessageActionsRouteDependencies) {
  app.use("/api/v1/conversations/*", createRequireSession(dependencies.resolveSession));
  app.openapi(editRoute, async (context) => { context.header("Cache-Control", "no-store"); if (!dependencies.edit) return apiErrorResponse(context, 503, "SERVICE_UNAVAILABLE", "Messaging is temporarily unavailable.") as never; try { const p = context.req.valid("param"); return context.json(await dependencies.edit.edit(context.get("actor").userId, p.conversationId, p.messageId, context.req.valid("json")), 200); } catch (error) { if (error instanceof MessagingError) return failure(context, error); throw error; } });
  app.openapi(unsendRoute, async (context) => { context.header("Cache-Control", "no-store"); if (!dependencies.unsend) return apiErrorResponse(context, 503, "SERVICE_UNAVAILABLE", "Messaging is temporarily unavailable.") as never; try { const p = context.req.valid("param"); return context.json((await dependencies.unsend.unsend(context.get("actor").userId, p.conversationId, p.messageId)).message, 200); } catch (error) { if (error instanceof MessagingError) return failure(context, error); throw error; } });
  app.openapi(setRoute, async (context) => { context.header("Cache-Control", "no-store"); if (!dependencies.setReaction) return apiErrorResponse(context, 503, "SERVICE_UNAVAILABLE", "Messaging is temporarily unavailable.") as never; try { const p = context.req.valid("param"); return context.json((await dependencies.setReaction.set(context.get("actor").userId, p.conversationId, p.messageId, context.req.valid("json").reaction)).message, 200); } catch (error) { if (error instanceof MessagingError) return failure(context, error); throw error; } });
  app.openapi(removeRoute, async (context) => { context.header("Cache-Control", "no-store"); if (!dependencies.removeReaction) return apiErrorResponse(context, 503, "SERVICE_UNAVAILABLE", "Messaging is temporarily unavailable.") as never; try { const p = context.req.valid("param"); return context.json((await dependencies.removeReaction.remove(context.get("actor").userId, p.conversationId, p.messageId)).message, 200); } catch (error) { if (error instanceof MessagingError) return failure(context, error); throw error; } });
}
