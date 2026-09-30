import { apiErrorSchema, opaqueIdSchema, utcTimestampSchema } from "@dayli/contracts";
import { z } from "@hono/zod-openapi";
import { rateLimitErrorResponse } from "../../../http/rate-limit-contract";

const sequenceSchema = z.string().regex(/^\d+$/).openapi({ example: "42" });
const messageTextSchema = z.string().max(8_000).refine((value) => Array.from(value).length <= 4_000, "Text must contain at most 4,000 Unicode code points.").openapi({ description: "1 through 4,000 Unicode code points. The 8,000 code-unit cap preserves valid astral Unicode text." });

export const reactionKeySchema = z.enum(["like", "love", "laugh", "surprised", "sad", "thanks"]);
export const messageParamsSchema = z.object({ conversationId: opaqueIdSchema, messageId: opaqueIdSchema });
export const conversationParamsSchema = z.object({ conversationId: opaqueIdSchema });
export const sendMessageBodySchema = z.object({
  clientMessageId: opaqueIdSchema,
  text: messageTextSchema,
  replyToMessageId: opaqueIdSchema.optional(),
}).strict();
export const editMessageBodySchema = z.object({ text: messageTextSchema, expectedVersion: z.number().int().min(1) }).strict();
export const setReactionBodySchema = z.object({ reaction: reactionKeySchema }).strict();

export const messageSchema = z.object({
  id: opaqueIdSchema,
  conversationId: opaqueIdSchema,
  sequence: sequenceSchema,
  senderId: opaqueIdSchema,
  clientMessageId: opaqueIdSchema,
  text: z.string().nullable(),
  replyToMessageId: opaqueIdSchema.nullable(),
  replyPreview: z.object({ id: opaqueIdSchema, senderId: opaqueIdSchema, text: z.string().nullable(), unsentAt: utcTimestampSchema.nullable() }).nullable(),
  version: z.number().int().min(1),
  createdAt: utcTimestampSchema,
  editedAt: utcTimestampSchema.nullable(),
  unsentAt: utcTimestampSchema.nullable(),
  reactions: z.array(z.object({ reaction: reactionKeySchema, count: z.number().int().min(1), reactedByActor: z.boolean() })),
}).openapi("Message");

export const messagingErrorResponses = {
  401: { description: "Authentication is required.", content: { "application/json": { schema: apiErrorSchema } } },
  403: { description: "The messaging action is not permitted.", content: { "application/json": { schema: apiErrorSchema } } },
  404: { description: "The conversation or message was not found.", content: { "application/json": { schema: apiErrorSchema } } },
  409: { description: "The messaging action conflicts with current state.", content: { "application/json": { schema: apiErrorSchema } } },
  422: { description: "The request contains invalid values.", content: { "application/json": { schema: apiErrorSchema } } },
  429: rateLimitErrorResponse,
  503: { description: "Messaging is temporarily unavailable.", content: { "application/json": { schema: apiErrorSchema } } },
} as const;
