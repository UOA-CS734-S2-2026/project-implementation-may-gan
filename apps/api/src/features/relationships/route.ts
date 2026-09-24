import { createRoute, type OpenAPIHono } from "@hono/zod-openapi";
import type { ApiError } from "@dayli/contracts";
import type { Context } from "hono";
import {
  pendingRequestPageSchema,
  pendingRequestQuerySchema,
  relationshipErrorResponses,
  relationshipRequestParamsSchema,
  relationshipStatusSchema,
  relationshipUserParamsSchema,
  sendRelationshipRequestBodySchema,
} from "./contract";
import { RelationshipServiceError, type RelationshipsService } from "./service";

export interface RelationshipSession {
  userId: string;
}

/**
 * The application composition root supplies this adapter from Better Auth's
 * cookie/bearer session lookup. Routes never accept an actor ID from JSON,
 * query parameters, or path parameters.
 */
export type ResolveRelationshipSession = (request: Request) => Promise<RelationshipSession | null>;

export interface RelationshipsRouteDependencies {
  service: RelationshipsService;
  resolveSession: ResolveRelationshipSession;
}

// The Better Auth composition root resolves either its secure browser cookie
// or native bearer session into the same server-side principal.
// Keep the alternatives as complete OpenAPI security requirement objects.
// An inferred union with optional keys is rejected by zod-openapi's index
// signature, while this shape also documents bearer and cookie auth as
// alternatives (rather than requiring both credentials).
const security: Array<Record<string, string[]>> = [
  { BearerAuth: [] },
  { cookieAuth: [] },
];

const pendingRequestsRoute = createRoute({
  method: "get",
  path: "/api/v1/relationships/requests",
  tags: ["Relationships"],
  operationId: "relationships.listPendingRequests",
  summary: "List pending relationship requests",
  security,
  request: { query: pendingRequestQuerySchema },
  responses: {
    200: {
      description: "Pending relationship requests visible to the authenticated user.",
      content: { "application/json": { schema: pendingRequestPageSchema } },
    },
    ...relationshipErrorResponses,
  },
});

const statusRoute = createRoute({
  method: "get",
  path: "/api/v1/relationships/{userId}",
  tags: ["Relationships"],
  operationId: "relationships.getStatus",
  summary: "Get relationship status with a user",
  security,
  request: { params: relationshipUserParamsSchema },
  responses: {
    200: {
      description: "The relationship status from the authenticated user's perspective.",
      content: { "application/json": { schema: relationshipStatusSchema } },
    },
    ...relationshipErrorResponses,
  },
});

const sendRequestRoute = createRoute({
  method: "post",
  path: "/api/v1/relationships/requests",
  tags: ["Relationships"],
  operationId: "relationships.sendRequest",
  summary: "Send a relationship request",
  security,
  request: { body: { content: { "application/json": { schema: sendRelationshipRequestBodySchema } } } },
  responses: {
    201: {
      description: "The pending relationship request was created.",
      content: { "application/json": { schema: relationshipStatusSchema } },
    },
    ...relationshipErrorResponses,
  },
});

function requestActionRoute(
  operationId: string,
  path: `/api/v1/relationships/requests/{requestId}/${"accept" | "decline" | "cancel"}`,
  summary: string,
) {
  return createRoute({
    method: "post",
    path,
    tags: ["Relationships"],
    operationId,
    summary,
    security,
    request: { params: relationshipRequestParamsSchema },
    responses: {
      200: {
        description: "The relationship state after the request transition.",
        content: { "application/json": { schema: relationshipStatusSchema } },
      },
      ...relationshipErrorResponses,
    },
  });
}

const acceptRequestRoute = requestActionRoute(
  "relationships.acceptRequest",
  "/api/v1/relationships/requests/{requestId}/accept",
  "Accept a pending relationship request",
);
const declineRequestRoute = requestActionRoute(
  "relationships.declineRequest",
  "/api/v1/relationships/requests/{requestId}/decline",
  "Decline a pending relationship request",
);
const cancelRequestRoute = requestActionRoute(
  "relationships.cancelRequest",
  "/api/v1/relationships/requests/{requestId}/cancel",
  "Cancel a pending relationship request",
);

function userActionRoute(
  method: "delete" | "post",
  operationId: string,
  path: `/api/v1/relationships/{userId}/${"friendship" | "block"}`,
  summary: string,
) {
  return createRoute({
    method,
    path,
    tags: ["Relationships"],
    operationId,
    summary,
    security,
    request: { params: relationshipUserParamsSchema },
    responses: {
      200: {
        description: "The relationship state after the transition.",
        content: { "application/json": { schema: relationshipStatusSchema } },
      },
      ...relationshipErrorResponses,
    },
  });
}

const removeFriendshipRoute = userActionRoute(
  "delete",
  "relationships.removeFriendship",
  "/api/v1/relationships/{userId}/friendship",
  "End an active friendship",
);
const blockRoute = userActionRoute(
  "post",
  "relationships.block",
  "/api/v1/relationships/{userId}/block",
  "Block a user",
);
const unblockRoute = userActionRoute(
  "delete",
  "relationships.unblock",
  "/api/v1/relationships/{userId}/block",
  "Unblock a user",
);

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

function unauthenticated(context: Context) {
  return context.json(errorBody("UNAUTHENTICATED", "Authentication is required."), 401);
}

function sessionUnavailable(context: Context) {
  return context.json(
    errorBody("SERVICE_UNAVAILABLE", "Authentication is temporarily unavailable."),
    503,
  );
}

function serviceError(context: Context, error: unknown) {
  if (!(error instanceof RelationshipServiceError)) {
    // Repository and adapter failures must not cross the API boundary. Keep a
    // server-side breadcrumb while returning the documented outage response.
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
      return context.json(errorBody("VALIDATION_FAILED", error.message), 422);
    case "VALIDATION_FAILED":
      return context.json(errorBody("VALIDATION_FAILED", error.message), 422);
  }
}

const SESSION_UNAVAILABLE = Symbol("session-unavailable");

async function getSession(context: Context, resolveSession: ResolveRelationshipSession) {
  try {
    const session = await resolveSession(context.req.raw);
    return session && session.userId.length > 0 ? session : null;
  } catch {
    return SESSION_UNAVAILABLE;
  }
}

export function registerRelationshipsRoutes(app: OpenAPIHono, dependencies: RelationshipsRouteDependencies) {
  app.openAPIRegistry.registerComponent("securitySchemes", "BearerAuth", {
    type: "http",
    scheme: "bearer",
    bearerFormat: "Dayli session token",
  });
  app.openAPIRegistry.registerComponent("securitySchemes", "cookieAuth", {
    type: "apiKey",
    in: "cookie",
    name: "better-auth.session_token",
    description: "Browser clients may authenticate with the Better Auth secure session cookie.",
  });

  app.use("/api/v1/relationships/*", async (context, next) => {
    try {
      await next();
    } finally {
      context.header("Cache-Control", "no-store");
    }
  });

  app.openapi(pendingRequestsRoute, async (context) => {
    const session = await getSession(context, dependencies.resolveSession);
    if (session === SESSION_UNAVAILABLE) return sessionUnavailable(context);
    if (!session) return unauthenticated(context);

    const { direction, limit, cursor } = context.req.valid("query");
    try {
      return context.json(await dependencies.service.listPendingRequests(session.userId, direction, limit, cursor), 200);
    } catch (error) {
      return serviceError(context, error);
    }
  });

  app.openapi(statusRoute, async (context) => {
    const session = await getSession(context, dependencies.resolveSession);
    if (session === SESSION_UNAVAILABLE) return sessionUnavailable(context);
    if (!session) return unauthenticated(context);

    const { userId } = context.req.valid("param");
    try {
      return context.json(await dependencies.service.getStatus(session.userId, userId), 200);
    } catch (error) {
      return serviceError(context, error);
    }
  });

  app.openapi(sendRequestRoute, async (context) => {
    const session = await getSession(context, dependencies.resolveSession);
    if (session === SESSION_UNAVAILABLE) return sessionUnavailable(context);
    if (!session) return unauthenticated(context);

    const { recipientId } = context.req.valid("json");
    try {
      return context.json(await dependencies.service.sendRequest(session.userId, recipientId), 201);
    } catch (error) {
      return serviceError(context, error);
    }
  });

  app.openapi(acceptRequestRoute, async (context) => {
    const session = await getSession(context, dependencies.resolveSession);
    if (session === SESSION_UNAVAILABLE) return sessionUnavailable(context);
    if (!session) return unauthenticated(context);

    const { requestId: relationshipRequestId } = context.req.valid("param");
    try {
      return context.json(await dependencies.service.acceptRequest(session.userId, relationshipRequestId), 200);
    } catch (error) {
      return serviceError(context, error);
    }
  });

  app.openapi(declineRequestRoute, async (context) => {
    const session = await getSession(context, dependencies.resolveSession);
    if (session === SESSION_UNAVAILABLE) return sessionUnavailable(context);
    if (!session) return unauthenticated(context);

    const { requestId: relationshipRequestId } = context.req.valid("param");
    try {
      return context.json(await dependencies.service.declineRequest(session.userId, relationshipRequestId), 200);
    } catch (error) {
      return serviceError(context, error);
    }
  });

  app.openapi(cancelRequestRoute, async (context) => {
    const session = await getSession(context, dependencies.resolveSession);
    if (session === SESSION_UNAVAILABLE) return sessionUnavailable(context);
    if (!session) return unauthenticated(context);

    const { requestId: relationshipRequestId } = context.req.valid("param");
    try {
      return context.json(await dependencies.service.cancelRequest(session.userId, relationshipRequestId), 200);
    } catch (error) {
      return serviceError(context, error);
    }
  });

  app.openapi(removeFriendshipRoute, async (context) => {
    const session = await getSession(context, dependencies.resolveSession);
    if (session === SESSION_UNAVAILABLE) return sessionUnavailable(context);
    if (!session) return unauthenticated(context);

    const { userId } = context.req.valid("param");
    try {
      return context.json(await dependencies.service.removeFriendship(session.userId, userId), 200);
    } catch (error) {
      return serviceError(context, error);
    }
  });

  app.openapi(blockRoute, async (context) => {
    const session = await getSession(context, dependencies.resolveSession);
    if (session === SESSION_UNAVAILABLE) return sessionUnavailable(context);
    if (!session) return unauthenticated(context);

    const { userId } = context.req.valid("param");
    try {
      return context.json(await dependencies.service.block(session.userId, userId), 200);
    } catch (error) {
      return serviceError(context, error);
    }
  });

  app.openapi(unblockRoute, async (context) => {
    const session = await getSession(context, dependencies.resolveSession);
    if (session === SESSION_UNAVAILABLE) return sessionUnavailable(context);
    if (!session) return unauthenticated(context);

    const { userId } = context.req.valid("param");
    try {
      return context.json(await dependencies.service.unblock(session.userId, userId), 200);
    } catch (error) {
      return serviceError(context, error);
    }
  });
}
