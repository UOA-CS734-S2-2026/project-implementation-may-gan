import { apiErrorSchema, opaqueIdSchema, utcTimestampSchema } from "@dayli/contracts";
import { z } from "@hono/zod-openapi";

const sequenceSchema = z.string().regex(/^\d+$/).openapi({ example: "42" });

export const reactionKeySchema = z.enum(["like", "love", "laugh", "surprised", "sad", "thanks"]);
export const messageParamsSchema = z.object({ conversationId: opaqueIdSchema, messageId: opaqueIdSchema });
export const conversationParamsSchema = z.object({ conversationId: opaqueIdSchema });
export const sendMessageBodySchema = z.object({
  clientMessageId: opaqueIdSchema,
  text: z.string().min(1).max(16_000), // Server service counts Unicode code points.
  replyToMessageId: opaqueIdSchema.optional(),
}).strict();
export const editMessageBodySchema = z.object({ text: z.string().min(1).max(16_000), expectedVersion: z.number().int().min(1) }).strict();
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
  503: { description: "Messaging is temporarily unavailable.", content: { "application/json": { schema: apiErrorSchema } } },
} as const;
