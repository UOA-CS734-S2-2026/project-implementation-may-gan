import { z } from "@hono/zod-openapi";
import { opaqueIdSchema } from "./common/identifiers";
import { utcTimestampSchema } from "./common/time";

/**
 * Small, body-free notifications sent through the authenticated realtime
 * transport. Clients use these only to reconcile through authorized REST.
 */
export const conversationChangedEventSchema = z.object({
  version: z.literal(1),
  eventId: opaqueIdSchema,
  type: z.literal("conversation.changed"),
  conversationId: opaqueIdSchema,
  changeSequence: z.string().regex(/^\d+$/),
});

export const realtimeReadyEventSchema = z.object({
  version: z.literal(1),
  type: z.literal("ready"),
  expiresAt: utcTimestampSchema,
});

export const realtimeEventSchema = z.discriminatedUnion("type", [
  conversationChangedEventSchema,
  realtimeReadyEventSchema,
]);

export type ConversationChangedEvent = z.infer<typeof conversationChangedEventSchema>;
export type RealtimeReadyEvent = z.infer<typeof realtimeReadyEventSchema>;
export type RealtimeEvent = z.infer<typeof realtimeEventSchema>;
