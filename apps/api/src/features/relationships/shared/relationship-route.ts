import type { OpenAPIHono } from "@hono/zod-openapi";
import type { ApiError } from "@dayli/contracts";
import type { Context } from "hono";
import type { AuthenticatedApiEnv } from "../../../http/authenticated-actor";
import { RelationshipServiceError, type RelationshipsService } from "../relationships.service";
import type { ResolveSession } from "../../../http/require-session";

export interface RelationshipsRouteDependencies {
  service: RelationshipsService;
  resolveSession: ResolveSession;
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
