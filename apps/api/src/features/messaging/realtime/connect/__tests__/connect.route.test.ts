import { describe, expect, it, vi } from "vitest";
import { createApp } from "../../../../../app";
import type { ApiRateLimitDependencies, RateLimitBinding } from "../../../../../http/middleware/rate-limit";

function rateLimitBinding(success = true): RateLimitBinding {
  return { limit: async () => ({ success }) };
}

function rateLimiting(realtime = true): ApiRateLimitDependencies {
  return {
    environmentScope: "test",
    bindings: {
      ingress: rateLimitBinding(),
      read: rateLimitBinding(),
      write: rateLimitBinding(),
      message: rateLimitBinding(),
      media: rateLimitBinding(),
      realtime: rateLimitBinding(realtime),
      directPush: rateLimitBinding(),
    },
  };
}

describe("connect realtime route", () => {
  it("reports fixed rejection reasons without tickets, origins or identifiers", async () => {
    const diagnostic = vi.fn();
    const namespace = { idFromName: vi.fn(), get: vi.fn() } as unknown as DurableObjectNamespace;
    const api = createApp({ realtimeConnect: { onDiagnostic: diagnostic, tickets: { consume: vi.fn(async () => null) }, resolveActiveSession: vi.fn(async () => null), userRealtime: namespace, trustedOrigins: ["https://web.example.test"], policyAllowsOrdinary: async () => true } });
    expect((await api.request("/api/v1/realtime/connect?ticket=private-ticket", { headers: { Upgrade: "websocket", Origin: "https://private-origin.example.test" } })).status).toBe(403);
    expect(diagnostic.mock.calls[0][0]).toEqual({ outcome: "origin_denied", httpStatus: 403, elapsedMs: expect.any(Number) });
    expect((await api.request("/api/v1/realtime/connect?ticket=private-ticket", { headers: { Upgrade: "websocket", Origin: "https://web.example.test" } })).status).toBe(401);
    expect(diagnostic.mock.calls[1][0]).toEqual({ outcome: "ticket_invalid", httpStatus: 401, elapsedMs: expect.any(Number) });
    expect(JSON.stringify(diagnostic.mock.calls)).not.toContain("private-");
  });
  it("forwards an authorized protocol upgrade to the user Durable Object", async () => {
    const fetch = vi.fn(async () => new Response(null, { status: 200 }));
    const namespace = {
      idFromName: (name: string) => name,
      get: () => ({ fetch }),
    } as unknown as DurableObjectNamespace;
    const api = createApp({
      realtimeConnect: {
        tickets: { consume: async () => ({ userId: "alice", sessionId: "session", expiresAt: new Date("2099-09-28T00:01:00.000Z"), sessionExpiresAt: new Date("2099-09-28T01:00:00.000Z") }) },
        resolveActiveSession: async () => ({ userId: "alice", sessionId: "session", expiresAt: new Date("2099-09-28T01:00:00.000Z") }),
        userRealtime: namespace,
        trustedOrigins: ["https://web.example.test"],
        policyAllowsOrdinary: async () => true,
      },
      rateLimiting: rateLimiting(),
    });
    const response = await api.request("/api/v1/realtime/connect?ticket=ticket", {
      headers: { Upgrade: "websocket", Origin: "https://web.example.test", "cf-connecting-ip": "198.51.100.10" },
    });
    expect(response.status).toBe(200);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("does not reach the Durable Object when the verified actor is rate limited", async () => {
    const fetch = vi.fn(async () => new Response(null, { status: 200 }));
    const consume = vi.fn(async () => ({ userId: "alice", sessionId: "session", expiresAt: new Date("2099-09-28T00:01:00.000Z"), sessionExpiresAt: new Date("2099-09-28T01:00:00.000Z") }));
    const namespace = {
      idFromName: (name: string) => name,
      get: () => ({ fetch }),
    } as unknown as DurableObjectNamespace;
    const api = createApp({
      realtimeConnect: {
        tickets: { consume },
        resolveActiveSession: async () => ({ userId: "alice", sessionId: "session", expiresAt: new Date("2099-09-28T01:00:00.000Z") }),
        userRealtime: namespace,
        trustedOrigins: ["https://web.example.test"],
        policyAllowsOrdinary: async () => true,
      },
      rateLimiting: rateLimiting(false),
    });

    const response = await api.request("/api/v1/realtime/connect?ticket=ticket", {
      headers: { Upgrade: "websocket", Origin: "https://web.example.test", "cf-connecting-ip": "198.51.100.11" },
    });

    expect(response.status).toBe(429);
    await expect(response.json()).resolves.toMatchObject({ error: { code: "RATE_LIMITED", details: { retryAfterSeconds: 60 } } });
    expect(consume).toHaveBeenCalledOnce();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("does not upgrade a ticket when a fresh policy check rejects or fails", async () => {
    const fetch = vi.fn(async () => new Response(null, { status: 200 }));
    const namespace = { idFromName: (name: string) => name, get: () => ({ fetch }) } as unknown as DurableObjectNamespace;
    const common = {
      tickets: { consume: async () => ({ userId: "alice", sessionId: "session", expiresAt: new Date("2099-09-28T00:01:00.000Z"), sessionExpiresAt: new Date("2099-09-28T01:00:00.000Z") }) },
      resolveActiveSession: async () => ({ userId: "alice", sessionId: "session", expiresAt: new Date("2099-09-28T01:00:00.000Z") }),
      userRealtime: namespace,
      trustedOrigins: ["https://web.example.test"],
    };
    const rejected = createApp({ realtimeConnect: { ...common, policyAllowsOrdinary: async () => false } });
    expect((await rejected.request("/api/v1/realtime/connect?ticket=ticket", { headers: { Upgrade: "websocket", Origin: "https://web.example.test" } })).status).toBe(403);
    const unavailable = createApp({ realtimeConnect: { ...common, policyAllowsOrdinary: async () => { throw new Error("unavailable"); } } });
    expect((await unavailable.request("/api/v1/realtime/connect?ticket=ticket", { headers: { Upgrade: "websocket", Origin: "https://web.example.test" } })).status).toBe(503);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("reports unavailable when the Worker binding is absent", async () => {
    const response = await createApp().request("/api/v1/realtime/connect", { headers: { Upgrade: "websocket" } });
    expect(response.status).toBe(503);
  });
});
