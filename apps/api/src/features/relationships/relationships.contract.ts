import {
  apiErrorSchema,
  cursorPaginationQuerySchema,
  opaqueIdSchema,
  paginatedResponseSchema,
  utcTimestampSchema,
} from "@dayli/contracts";
import { z } from "@hono/zod-openapi";

export const relationshipStateSchema = z
  .enum(["none", "outgoing_pending", "incoming_pending", "friends", "blocked"])
  .openapi("RelationshipState");

export const pendingRequestSchema = z
  .object({
    id: opaqueIdSchema,
    senderId: opaqueIdSchema,
    recipientId: opaqueIdSchema,
    createdAt: utcTimestampSchema,
  })
  .openapi("PendingRelationshipRequest");

export const relationshipStatusSchema = z
  .object({
    userId: opaqueIdSchema,
    status: relationshipStateSchema,
    incomingRequest: pendingRequestSchema.nullable(),
    outgoingRequest: pendingRequestSchema.nullable(),
  })
  .openapi("RelationshipStatus");

export const pendingRequestPageSchema = paginatedResponseSchema(pendingRequestSchema).openapi("PendingRequestPage");

export const relationshipUserParamsSchema = z.object({
  userId: opaqueIdSchema,
});

export const relationshipRequestParamsSchema = z.object({
  requestId: opaqueIdSchema,
});

export const sendRelationshipRequestBodySchema = z
  .object({
    recipientId: opaqueIdSchema,
  })
  .strict()
  .openapi("SendRelationshipRequest");

export const pendingRequestQuerySchema = cursorPaginationQuerySchema
  .extend({
    direction: z.enum(["incoming", "outgoing", "all"]).default("all"),
  })
  .openapi("PendingRequestQuery");

export const relationshipErrorResponses = {
  401: {
    description: "Authentication is required.",
    content: { "application/json": { schema: apiErrorSchema } },
  },
  403: {
    description: "The relationship operation is not permitted.",
    content: { "application/json": { schema: apiErrorSchema } },
  },
  404: {
    description: "The relationship or request was not found.",
    content: { "application/json": { schema: apiErrorSchema } },
  },
  409: {
    description: "The relationship is in a conflicting state.",
    content: { "application/json": { schema: apiErrorSchema } },
  },
  422: {
    description: "The request contains invalid values.",
    content: { "application/json": { schema: apiErrorSchema } },
  },
  429: {
    description: "The request-send limit has been exceeded.",
    content: { "application/json": { schema: apiErrorSchema } },
  },
  503: {
    description: "Authentication or relationship storage is temporarily unavailable.",
    content: { "application/json": { schema: apiErrorSchema } },
  },
  default: {
    description: "An unexpected server error occurred.",
    content: { "application/json": { schema: apiErrorSchema } },
  },
} as const;

export type RelationshipState = z.infer<typeof relationshipStateSchema>;
export type PendingRelationshipRequest = z.infer<typeof pendingRequestSchema>;
export type RelationshipStatus = z.infer<typeof relationshipStatusSchema>;
export type PendingRequestPage = z.infer<typeof pendingRequestPageSchema>;
export type PendingRequestQuery = z.infer<typeof pendingRequestQuerySchema>;
