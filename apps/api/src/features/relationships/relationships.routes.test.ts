import { describe, expect, it, vi } from "vitest";
import { OpenAPIHono } from "@hono/zod-openapi";
import type { AuthenticatedApiEnv } from "../../http/authenticated-actor";
import { createApp } from "../../app";
import { registerRelationshipsRoutes } from "./relationships.routes";
import { RelationshipServiceError, type RelationshipsService } from "./relationships.service";

const status = {
  userId: "user_bob",
  status: "none" as const,
  incomingRequest: null,
  outgoingRequest: null,
};

function createTestApp(options: {
  authenticated?: boolean;
  sessionError?: boolean;
  service?: Partial<RelationshipsService>;
} = {}) {
  const service: RelationshipsService = {
    getStatus: vi.fn(async () => status),
    listPendingRequests: vi.fn(async () => ({ items: [], nextCursor: null, hasMore: false })),
    listFriends: vi.fn(async () => ({ items: [], nextCursor: null, hasMore: false })),
    searchUsers: vi.fn(async () => ({ items: [], nextCursor: null, hasMore: false })),
    sendRequest: vi.fn(async () => status),
    acceptRequest: vi.fn(async () => status),
    declineRequest: vi.fn(async () => status),
    cancelRequest: vi.fn(async () => status),
    removeFriendship: vi.fn(async () => status),
    block: vi.fn(async () => status),
    unblock: vi.fn(async () => status),
    ...options.service,
  };
  const app = new OpenAPIHono<AuthenticatedApiEnv>({
    defaultHook: (result, context) => {
      if (!result.success) {
        return context.json({
          error: {
            code: "VALIDATION_FAILED" as const,
            message: "The request contains invalid values.",
            requestId: "req_test",
            details: { issues: result.error.issues },
          },
        }, 422);
      }
    },
  });
  registerRelationshipsRoutes(app, {
    service,
    resolveSession: vi.fn(async () => {
      if (options.sessionError) throw new Error("database password leaked by backend");
      return options.authenticated === false ? null : { userId: "user_alice" };
    }),
  });
  app.doc("/openapi.json", {
    openapi: "3.1.0",
    info: { title: "Relationships test API", version: "0.0.0" },
  });
  return { app, service };
}

function expectNoStore(response: Response) {
  expect(response.headers.get("cache-control")).toBe("no-store");
}

describe("relationships routes", () => {
  it("registers relationship paths on the default app OpenAPI document", async () => {
    const response = await createApp().request("/api/v1/openapi.json");
    const document = await response.json<{ paths: Record<string, Record<string, { security?: unknown }>> }>();

    expect(response.status).toBe(200);
    expect(document.paths).toHaveProperty("/api/v1/relationships/requests");
    expect(document.paths["/api/v1/relationships/requests"]?.get?.security).toEqual([
      { BearerAuth: [] },
      { cookieAuth: [] },
    ]);
  });

  it("requires an authenticated Better Auth session at the route boundary", async () => {
    const { app, service } = createTestApp({ authenticated: false });
    const response = await app.request("/api/v1/relationships/user_bob");

    expect(response.status).toBe(401);
    expectNoStore(response);
    expect(await response.json()).toMatchObject({ error: { code: "UNAUTHENTICATED" } });
    expect(service.getStatus).not.toHaveBeenCalled();
  });

  it("derives the actor from the session and rejects a client actor field", async () => {
    const { app, service } = createTestApp();
    const response = await app.request("/api/v1/relationships/requests", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ recipientId: "user_bob", actorId: "user_eve" }),
    });

    expect(response.status).toBe(422);
    expectNoStore(response);
    expect(service.sendRequest).not.toHaveBeenCalled();
  });

  it("passes only the authenticated actor to request mutations", async () => {
    const { app, service } = createTestApp();
    const response = await app.request("/api/v1/relationships/requests", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ recipientId: "user_bob" }),
    });

    expect(response.status).toBe(201);
    expectNoStore(response);
    expect(service.sendRequest).toHaveBeenCalledWith("user_alice", "user_bob");
  });

  it("turns session lookup failures into a sanitized 503", async () => {
    const { app } = createTestApp({ sessionError: true });
    const response = await app.request("/api/v1/relationships/user_bob");
    const body = await response.text();

    expect(response.status).toBe(503);
    expectNoStore(response);
    expect(body).toContain("SERVICE_UNAVAILABLE");
    expect(body).toContain("Authentication is temporarily unavailable.");
    expect(body).not.toContain("database password");
  });

  it("searches only with the verified actor, requires a bounded username prefix, and keeps replies private", async () => {
    const { app, service } = createTestApp();
    const response = await app.request("/api/v1/relationships/search?q=bo&limit=20");

    expect(response.status).toBe(200);
    expectNoStore(response);
    expect(service.searchUsers).toHaveBeenCalledWith("user_alice", "bo", 20, undefined);

    const tooShort = await app.request("/api/v1/relationships/search?q=b");
    expect(tooShort.status).toBe(422);
    expectNoStore(tooShort);
  });

  it("maps the rolling send throttle to 429 with a retry hint", async () => {
    const { app } = createTestApp({
      service: {
        sendRequest: vi.fn(async () => {
          throw new RelationshipServiceError("RATE_LIMITED", "Too many relationship requests were sent recently.", {
            retryAfterSeconds: 1_234,
          });
        }),
      },
    });
    const response = await app.request("/api/v1/relationships/requests", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ recipientId: "user_bob" }),
    });
    const body = await response.json() as { error: {
      code: string;
      requestId: string;
      details: { retryAfterSeconds: number };
    } };

    expect(response.status).toBe(429);
    expectNoStore(response);
    expect(body.error.code).toBe("RATE_LIMITED");
    expect(body.error.details.retryAfterSeconds).toBe(1_234);
    expect(body.error.requestId).toMatch(/^req_/);
    expect(body.error.requestId).not.toBe("client-controlled");
  });

  it("logs unexpected relationship adapter failures and returns a sanitized 503", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { app } = createTestApp({
      service: {
        getStatus: vi.fn(async () => {
          throw new Error("postgres password and private request payload");
        }),
      },
    });
    const response = await app.request("/api/v1/relationships/user_bob");
    const body = await response.text();

    expect(response.status).toBe(503);
    expectNoStore(response);
    expect(body).toContain("SERVICE_UNAVAILABLE");
    expect(body).not.toContain("postgres password");
    expect(body).not.toContain("private request payload");
    expect(log).toHaveBeenCalled();
    log.mockRestore();
  });

  it("registers pending reads and every request/friendship/block transition", async () => {
    const { app } = createTestApp();
    const requests = await Promise.all([
      app.request("/api/v1/relationships/requests"),
      app.request("/api/v1/relationships/friends"),
      app.request("/api/v1/relationships/search?q=bo"),
      app.request("/api/v1/relationships/requests/request-1/accept", { method: "POST" }),
      app.request("/api/v1/relationships/requests/request-1/decline", { method: "POST" }),
      app.request("/api/v1/relationships/requests/request-1/cancel", { method: "POST" }),
      app.request("/api/v1/relationships/user_bob/friendship", { method: "DELETE" }),
      app.request("/api/v1/relationships/user_bob/block", { method: "POST" }),
      app.request("/api/v1/relationships/user_bob/block", { method: "DELETE" }),
    ]);

    expect(requests.map((response) => response.status)).toEqual([200, 200, 200, 200, 200, 200, 200, 200, 200]);
    requests.forEach(expectNoStore);
  });

  it("documents cookie and bearer session alternatives for every operation", async () => {
    const { app } = createTestApp();
    const response = await app.request("/openapi.json");
    const document = await response.json<{ paths: Record<string, Record<string, { security?: unknown }>> }>();
    const operation = document.paths["/api/v1/relationships/requests"]?.post;

    expect(response.status).toBe(200);
    expect(operation?.security).toEqual([
      { BearerAuth: [] },
      { cookieAuth: [] },
    ]);
    const components = document as unknown as {
      components?: { securitySchemes?: Record<string, { type: string; in?: string; scheme?: string }> };
    };
    expect(components.components?.securitySchemes).toMatchObject({
      BearerAuth: { type: "http", scheme: "bearer" },
      cookieAuth: { type: "apiKey", in: "cookie" },
    });
  });
});
