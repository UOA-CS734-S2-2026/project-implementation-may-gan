import {
  apiErrorSchema,
  cursorPaginationQuerySchema,
  opaqueIdSchema,
  paginatedResponseSchema,
  utcTimestampSchema,
} from "@dayli/contracts";
import { z } from "@hono/zod-openapi";
import { rateLimitErrorResponse } from "../../../http/rate-limit-contract";

export const relationshipStateSchema = z
  .enum(["none", "outgoing_pending", "incoming_pending", "friends", "blocked"])
  .openapi("RelationshipState");

export const relationshipUserCardSchema = z
  .object({
    id: opaqueIdSchema,
    username: z.string().min(1),
    displayName: z.string().min(1),
    relationship: relationshipStateSchema,
  })
  .openapi("RelationshipUserCard", {
    description: "Minimal discovery card. It grants no profile access and never contains email, bio, image, or visibility.",
  });

export const pendingRequestSchema = z
  .object({
    id: opaqueIdSchema,
    senderId: opaqueIdSchema,
    recipientId: opaqueIdSchema,
    createdAt: utcTimestampSchema,
    user: relationshipUserCardSchema.optional(),
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
export const relationshipUserPageSchema = paginatedResponseSchema(relationshipUserCardSchema).openapi("RelationshipUserPage");

export const relationshipUserParamsSchema = z.object({
  userId: opaqueIdSchema,
});

export const usernameProfileParamsSchema = z.object({
  username: z.string().trim().min(2).max(32).regex(/^[a-zA-Z0-9_]+$/),
}).openapi("UsernameProfileParams");

/** A privacy-safe profile is intentionally no richer than the discovery card. */
export const relationshipProfileSchema = relationshipUserCardSchema.openapi("RelationshipProfile", {
  description: "Authenticated, actor-scoped profile projection. Blocked and unknown usernames both return 404.",
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

const relationshipUserPageQuerySchema = z.object({
  cursor: z.string().min(1).optional().openapi({ description: "Opaque continuation cursor" }),
  limit: z.coerce.number().int().min(1).max(20).default(20).openapi({ example: 20 }),
});

export const friendsQuerySchema = relationshipUserPageQuerySchema.openapi("FriendsQuery");
export const usernameSearchQuerySchema = relationshipUserPageQuerySchema.extend({
  q: z.string().trim().min(2).max(32).regex(/^[a-zA-Z0-9_]+$/).openapi({
    description: "Case-insensitive username prefix. Username setup is required for discovery.",
    example: "day",
  }),
}).openapi("UsernameSearchQuery");

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
  429: rateLimitErrorResponse,
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
export type RelationshipUserPage = z.infer<typeof relationshipUserPageSchema>;
export type PendingRequestQuery = z.infer<typeof pendingRequestQuerySchema>;
