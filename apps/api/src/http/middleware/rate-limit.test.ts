import { describe, expect, it, vi } from "vitest";
import { createApp, type AppDependencies } from "../../app";
import {
  createActorRateLimiter,
  rateLimitActionFor,
  rateLimitBindings,
  type ApiRateLimitDependencies,
  type RateLimitBinding,
} from "./rate-limit";

function binding(result: boolean = true): RateLimitBinding & { limit: ReturnType<typeof vi.fn> } {
  return { limit: vi.fn(async () => ({ success: result })) };
}

function dependencies(overrides: Partial<Record<keyof typeof rateLimitBindings, RateLimitBinding>> = {}): ApiRateLimitDependencies {
  return {
    environmentScope: "test",
    bindings: {
      ingress: binding(),
      read: binding(),
      write: binding(),
      message: binding(),
      media: binding(),
      realtime: binding(),
      directPush: binding(),
      ...overrides,
    },
  };
}

const message = {
  id: "m1", conversationId: "c1", sequence: "1", senderId: "alice", clientMessageId: "client", text: "hello", replyToMessageId: null,
  replyPreview: null, version: 1, createdAt: "2026-09-28T00:00:00.000Z", editedAt: null, unsentAt: null, reactions: [],
};

function messagingApp(rateLimiting: ApiRateLimitDependencies, resolveSession = vi.fn(async () => ({ userId: "alice" }))) {
  const send = vi.fn(async () => ({ replayed: false, message }));
  return {
    api: createApp({ rateLimiting, messaging: { resolveSession, service: { send } } }),
    resolveSession,
    send,
  };
}

function sendMessage(api: ReturnType<typeof createApp>, ip = "198.51.100.9") {
  return api.request("/api/v1/conversations/c1/messages", {
    method: "POST",
    headers: { "content-type": "application/json", "cf-connecting-ip": ip },
    body: JSON.stringify({ clientMessageId: "client", text: "hello" }),
  });
}

describe("native API rate limiting", () => {
  it("allows a request and applies actor general and action buckets", async () => {
    const configured = dependencies();
    const { api, send } = messagingApp(configured);

    const response = await sendMessage(api);

    expect(response.status).toBe(201);
    expect(send).toHaveBeenCalledOnce();
    expect(configured.bindings!.ingress!.limit).toHaveBeenCalledWith({ key: "environment:test:ingress:198.51.100.9" });
    expect(configured.bindings!.write!.limit).toHaveBeenCalledWith({ key: "environment:test:actor:alice" });
    expect(configured.bindings!.message!.limit).toHaveBeenCalledWith({ key: "environment:test:action:send_message:actor:alice" });
  });

  it("denies before the protected handler and returns the API envelope", async () => {
    const configured = dependencies({ write: binding(false) });
    const { api, send } = messagingApp(configured);

    const response = await sendMessage(api);

    expect(response.status).toBe(429);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("retry-after")).toBe("60");
    await expect(response.json()).resolves.toMatchObject({ error: { code: "RATE_LIMITED", details: { retryAfterSeconds: 60 } } });
    expect(send).not.toHaveBeenCalled();
  });

  it("keeps actor buckets isolated", async () => {
    const configured = dependencies();
    const actors = ["alice", "bob"];
    const resolveSession = vi.fn(async () => ({ userId: actors.shift()! }));
    const { api } = messagingApp(configured, resolveSession);

    expect((await sendMessage(api, "198.51.100.10")).status).toBe(201);
    expect((await sendMessage(api, "198.51.100.11")).status).toBe(201);

    expect(configured.bindings!.write!.limit).toHaveBeenNthCalledWith(1, { key: "environment:test:actor:alice" });
    expect(configured.bindings!.write!.limit).toHaveBeenNthCalledWith(2, { key: "environment:test:actor:bob" });
  });

  it("fails closed when a deployed limiter binding is absent, before authentication work", async () => {
    const { api, resolveSession, send } = messagingApp({});

    const response = await sendMessage(api);

    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toMatchObject({ error: { code: "SERVICE_UNAVAILABLE" } });
    expect(resolveSession).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });

  it("bypasses CORS preflight and health while keeping a denied response readable to a trusted browser", async () => {
    const configured = dependencies({ ingress: binding(false) });
    const origin = "https://web.dayli.test";
    const api = createApp({ rateLimiting: configured, trustedOrigins: [origin], posts: { resolveSession: async () => null } });

    const preflight = await api.request("/api/v1/posts", {
      method: "OPTIONS",
      headers: { origin, "access-control-request-method": "POST", "access-control-request-headers": "content-type" },
    });
    const health = await api.request("/api/v1/health");
    const denied = await api.request("/api/v1/posts", { method: "POST", headers: { origin, "cf-connecting-ip": "198.51.100.12" } });

    expect(preflight.status).toBe(204);
    expect(health.status).toBe(200);
    expect(denied.status).toBe(429);
    expect(denied.headers.get("access-control-expose-headers")).toContain("retry-after");
    expect(denied.headers.get("access-control-allow-origin")).toBe(origin);
    expect(configured.bindings!.ingress!.limit).toHaveBeenCalledOnce();
  });

  it("uses distinct environment scopes for identical actor and IP keys", async () => {
    const first = dependencies();
    const second = { ...dependencies(), environmentScope: "staging" };
    const firstLimiter = createActorRateLimiter(first);
    const secondLimiter = createActorRateLimiter(second);
    const request = new Request("https://api.example.test/api/v1/feed");

    await firstLimiter.check(request, { userId: "alice" });
    await secondLimiter.check(request, { userId: "alice" });

    expect(first.bindings!.read!.limit).toHaveBeenCalledWith({ key: "environment:test:actor:alice" });
    expect(second.bindings!.read!.limit).toHaveBeenCalledWith({ key: "environment:staging:actor:alice" });
  });

  it("rejects a rate-limited auth request before calling the auth provider", async () => {
    const origin = "https://web.dayli.test";
    const handler = vi.fn(async () => new Response(null, { status: 200 }));
    const auth = {
      trustedOrigins: [origin],
      auth: { handler },
      socialLinkConfirmations: {},
    } as unknown as NonNullable<AppDependencies["auth"]>;
    const api = createApp({ auth, trustedOrigins: [origin], rateLimiting: dependencies({ ingress: binding(false) }) });

    const preflight = await api.request("/api/auth/sign-in/email", {
      method: "OPTIONS",
      headers: { origin, "access-control-request-method": "POST", "access-control-request-headers": "content-type" },
    });
    const response = await api.request("/api/auth/sign-in/email", {
      method: "POST",
      headers: { origin, "cf-connecting-ip": "198.51.100.19" },
    });

    expect(preflight.status).toBe(204);
    expect(preflight.headers.get("access-control-allow-origin")).toBe(origin);
    expect(response.status).toBe(429);
    expect(response.headers.get("access-control-allow-origin")).toBe(origin);
    expect(response.headers.get("access-control-expose-headers")).toContain("retry-after");
    expect(handler).not.toHaveBeenCalled();
  });

  it("fails closed for an auth request when the ingress limiter throws", async () => {
    const origin = "https://web.dayli.test";
    const alert = vi.fn();
    const handler = vi.fn(async () => new Response(null, { status: 200 }));
    const auth = {
      trustedOrigins: [origin],
      auth: { handler },
      socialLinkConfirmations: {},
    } as unknown as NonNullable<AppDependencies["auth"]>;
    const ingress = { limit: vi.fn(async () => { throw new Error("token=must-not-be-reported"); }) };
    const api = createApp({ auth, trustedOrigins: [origin], rateLimiting: { ...dependencies(), bindings: { ...dependencies().bindings, ingress }, onOperationalAlert: alert } });

    const response = await api.request("/api/auth/sign-in/email", {
      method: "POST",
      headers: { origin, "cf-connecting-ip": "198.51.100.19" },
    });

    expect(response.status).toBe(503);
    expect(response.headers.get("access-control-allow-origin")).toBe(origin);
    expect(handler).not.toHaveBeenCalled();
    expect(alert).toHaveBeenCalledWith("rate_limit_backend_unavailable");
    expect(JSON.stringify(alert.mock.calls)).not.toContain("token=");
  });

  it("fails closed for an authenticated route when a native limiter is unavailable and alerts without actor data", async () => {
    const alert = vi.fn();
    const read = { limit: vi.fn(async () => { throw new Error("credential=must-not-be-reported"); }) };
    const limiter = createActorRateLimiter({ environmentScope: "test", bindings: { ...dependencies().bindings, read }, onOperationalAlert: alert });

    await expect(limiter.check(new Request("https://api.example.test/api/v1/feed"), { userId: "alice" })).resolves.toBe("unavailable");
    expect(alert).toHaveBeenCalledWith("rate_limit_backend_unavailable");
    expect(JSON.stringify(alert.mock.calls)).not.toContain("alice");
    expect(JSON.stringify(alert.mock.calls)).not.toContain("credential=");
  });

  it.each([
    ["POST", "/api/v1/conversations/c1/messages", { action: "send_message", binding: "message" }],
    ["POST", "/api/v1/conversations/direct", { action: "create_direct_conversation", binding: "directPush" }],
    ["POST", "/api/v1/realtime/tickets", { action: "create_realtime_ticket", binding: "realtime" }],
    ["GET", "/api/v1/realtime/connect", { action: "connect_realtime", binding: "realtime" }],
    ["PUT", "/api/v1/push/devices/install-1", { action: "register_push_device", binding: "directPush" }],
    ["POST", "/api/v1/media-reservations", { action: "reserve_media_upload", binding: "media" }],
    ["POST", "/api/v1/media-reservations/res-1/complete", { action: "complete_media_upload", binding: "media" }],
  ])("maps %s %s to the intended action policy", (method, path, expected) => {
    expect(rateLimitActionFor(new Request(`https://api.example.test${path}`, { method }))).toEqual(expected);
  });
});
