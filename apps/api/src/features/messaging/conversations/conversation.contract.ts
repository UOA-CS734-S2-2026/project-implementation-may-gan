import { apiErrorSchema, opaqueIdSchema, utcTimestampSchema } from "@dayli/contracts";
import { z } from "@hono/zod-openapi";
import { messageSchema } from "../messages/message.contract";

const sequence = z.string().regex(/^\d+$/).openapi({ example: "42" });
export const conversationParamsSchema = z.object({ conversationId: opaqueIdSchema });
const messageTextSchema = z.string().max(8_000).refine((value) => Array.from(value).length <= 4_000, "Text must contain at most 4,000 Unicode code points.").openapi({ description: "1 through 4,000 Unicode code points. The 8,000 code-unit cap preserves valid astral Unicode text." });
export const directConversationBodySchema = z.object({ recipientId: opaqueIdSchema, clientMessageId: opaqueIdSchema, text: messageTextSchema }).strict();
export const conversationFolderSchema = z.object({ folder: z.enum(["inbox", "requests"]).default("inbox"), cursor: z.string().min(1).optional(), limit: z.coerce.number().int().min(1).max(100).default(30) });
export const messagesQuerySchema = z.object({ beforeSequence: sequence.optional(), afterSequence: sequence.optional(), limit: z.coerce.number().int().min(1).max(100).default(50) }).superRefine((value, context) => { if (value.beforeSequence && value.afterSequence) context.addIssue({ code: "custom", message: "Only one cursor direction is allowed." }); });
export const changesQuerySchema = z.object({ afterChangeSequence: sequence.optional(), limit: z.coerce.number().int().min(1).max(200).default(100) });
export const resolveRequestBodySchema = z.object({ decision: z.enum(["accept", "decline"]) }).strict();
export const markReadBodySchema = z.object({ throughSequence: sequence }).strict();

export const conversationSchema = z.object({
  id: opaqueIdSchema,
  peer: z.object({ id: opaqueIdSchema, name: z.string().nullable() }),
  requestState: z.enum(["pending", "active", "declined"]),
  latestMessage: messageSchema.nullable(),
  unreadCount: z.number().int().min(0),
  lastMessageSequence: sequence,
  lastChangeSequence: sequence,
  lastReadSequence: sequence,
  receiptSequence: sequence,
  capabilities: z.object({ canSend: z.boolean(), canResolveRequest: z.boolean() }),
  updatedAt: utcTimestampSchema,
}).openapi("Conversation");

export const directConversationResponseSchema = z.object({ conversation: conversationSchema.pick({ id: true, peer: true, requestState: true }), message: messageSchema });
export const conversationListSchema = z.object({ items: z.array(conversationSchema), nextCursor: z.string().nullable() });
export const unreadSchema = z.object({ inboxCount: z.number().int().min(0), requestCount: z.number().int().min(0) });
export const messageListSchema = z.object({ items: z.array(messageSchema), nextCursor: sequence.nullable(), hasMore: z.boolean() });
export const changesSchema = z.object({ items: z.array(z.object({ changeSequence: sequence, kind: z.string(), messageId: opaqueIdSchema.nullable(), memberId: opaqueIdSchema.nullable(), createdAt: utcTimestampSchema })), nextChangeSequence: sequence.nullable(), hasMore: z.boolean(), highWatermark: sequence });
export const readSchema = z.object({ lastReadSequence: sequence, receiptSequence: sequence, unreadCount: z.number().int().min(0) });
export const messagingReadErrors = { 401: { description: "Authentication is required.", content: { "application/json": { schema: apiErrorSchema } } }, 403: { description: "The action is not permitted.", content: { "application/json": { schema: apiErrorSchema } } }, 404: { description: "The conversation was not found.", content: { "application/json": { schema: apiErrorSchema } } }, 409: { description: "The action conflicts with current state.", content: { "application/json": { schema: apiErrorSchema } } }, 422: { description: "The request contains invalid values.", content: { "application/json": { schema: apiErrorSchema } } }, 503: { description: "Messaging is temporarily unavailable.", content: { "application/json": { schema: apiErrorSchema } } } } as const;
