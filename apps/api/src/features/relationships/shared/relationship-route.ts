import type { OpenAPIHono } from "@hono/zod-openapi";
import type { ApiError } from "@dayli/contracts";
import type { Context } from "hono";
import type { AuthenticatedApiEnv } from "../../../http/authenticated-actor";
import {
  RelationshipServiceError,
  type PendingRequestDirection,
  type PendingRequestPage,
  type RelationshipStatus,
  type RelationshipUserPage,
} from "./relationship-service";
import type { ResolveSession } from "../../../http/middleware/require-session";

export interface RelationshipsService {
  getStatus(actorId: string, subjectId: string): Promise<RelationshipStatus>;
  listPendingRequests(actorId: string, direction: PendingRequestDirection, limit: number, cursor?: string): Promise<PendingRequestPage>;
  listFriends(actorId: string, limit: number, cursor?: string): Promise<RelationshipUserPage>;
  searchUsers(actorId: string, query: string, limit: number, cursor?: string): Promise<RelationshipUserPage>;
  sendRequest(actorId: string, recipientId: string): Promise<RelationshipStatus>;
  acceptRequest(actorId: string, requestId: string): Promise<RelationshipStatus>;
  declineRequest(actorId: string, requestId: string): Promise<RelationshipStatus>;
  cancelRequest(actorId: string, requestId: string): Promise<RelationshipStatus>;
  removeFriendship(actorId: string, subjectId: string): Promise<RelationshipStatus>;
  block(actorId: string, subjectId: string): Promise<RelationshipStatus>;
  unblock(actorId: string, subjectId: string): Promise<RelationshipStatus>;
}

export interface RelationshipsRouteDependencies {
  service: RelationshipsService;
  resolveSession: ResolveSession;
  /** Denies discovery and relationship mutations until the actor has a public handle. */
  hasUsername?: (userId: string) => Promise<boolean>;
}

export const relationshipSecurity: Array<Record<string, string[]>> = [
  { BearerAuth: [] },
  { cookieAuth: [] },
];

function requestId() {
  return `req_${crypto.randomUUID()}`;
}

function errorBody(
  code: ApiError["error"]["code"],
  message: string,
  details?: Record<string, unknown>,
) {
  return {
    error: {
      code,
      message,
      requestId: requestId(),
      ...(details ? { details } : {}),
    },
  };
}

export function relationshipServiceError(context: Context, error: unknown) {
  if (!(error instanceof RelationshipServiceError)) {
    console.error("dayli relationship operation failed", error);
    return context.json(errorBody("SERVICE_UNAVAILABLE", "Relationship storage is temporarily unavailable."), 503);
  }

  switch (error.code) {
    case "NOT_FOUND":
      return context.json(errorBody("NOT_FOUND", error.message), 404);
    case "FORBIDDEN":
      return context.json(errorBody("FORBIDDEN", error.message), 403);
    case "CONFLICT":
      return context.json(errorBody("CONFLICT", error.message), 409);
    case "RATE_LIMITED":
      return context.json(errorBody("RATE_LIMITED", error.message, {
        ...(error.retryAfterSeconds === undefined ? {} : { retryAfterSeconds: error.retryAfterSeconds }),
      }), 429);
    case "SELF_RELATIONSHIP":
    case "VALIDATION_FAILED":
      return context.json(errorBody("VALIDATION_FAILED", error.message), 422);
  }
}

export type RelationshipRouteApp = OpenAPIHono<AuthenticatedApiEnv>;
