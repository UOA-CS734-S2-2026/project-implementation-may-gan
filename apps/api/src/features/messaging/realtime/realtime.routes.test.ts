import { describe, expect, it, vi } from "vitest";
import { createApp } from "../../../app";

const actor = { userId: "alice" };

describe("live messaging route composition", () => {
  it("mounts authenticated ticket, push registration, and the protocol upgrade without a database", async () => {
    const issue = vi.fn(async () => ({ ticket: "ticket", expiresAt: new Date("2099-09-28T00:01:00.000Z") }));
    const register = vi.fn(async () => undefined);
    const namespace = {
      idFromName: (name: string) => name,
      get: () => ({ fetch: vi.fn(async () => new Response(null, { status: 200 })) }),
    } as unknown as DurableObjectNamespace;
    const api = createApp({
      realtimeTicket: {
        resolveSession: async () => actor,
        resolveRealtimeSession: async () => ({ userId: "alice", sessionId: "session", expiresAt: new Date("2099-09-28T01:00:00.000Z") }),
        tickets: { issue },
        webSocketUrl: "wss://api.example.test/api/v1/realtime/connect",
      },
      pushDevices: {
        resolveSession: async () => actor,
        resolvePushSession: async () => ({ userId: "alice", sessionId: "session" }),
        devices: { register, unregister: async () => undefined },
      },
      realtimeConnect: {
        tickets: { consume: async () => ({ userId: "alice", sessionId: "session", expiresAt: new Date("2099-09-28T00:01:00.000Z"), sessionExpiresAt: new Date("2099-09-28T01:00:00.000Z") }) },
        resolveActiveSession: async () => ({ userId: "alice", sessionId: "session", expiresAt: new Date("2099-09-28T01:00:00.000Z") }),
        userRealtime: namespace,
        trustedOrigins: ["https://web.example.test"],
      },
    });
    const ticket = await api.request("/api/v1/realtime/tickets", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
    expect(ticket.status).toBe(201);
    expect(issue).toHaveBeenCalledWith(expect.objectContaining({ userId: "alice", sessionId: "session" }));
    const push = await api.request("/api/v1/push/devices/install", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ token: "a-valid-provider-token", platform: "ios", optedIn: true }) });
    expect(push.status).toBe(204);
    expect(register).toHaveBeenCalledWith(expect.objectContaining({ userId: "alice" }), expect.objectContaining({ installationId: "install" }));
    const connect = await api.request("/api/v1/realtime/connect?ticket=ticket", { headers: { Upgrade: "websocket", Origin: "https://web.example.test" } });
    expect(connect.status).toBe(200);
  });

  it("blocks username-less actors from tickets, push registration, and realtime connections", async () => {
    const issue = vi.fn(async () => ({ ticket: "ticket", expiresAt: new Date("2099-09-28T00:01:00.000Z") }));
    const register = vi.fn(async () => undefined);
    const fetch = vi.fn(async () => new Response(null, { status: 200 }));
    const namespace = { idFromName: (name: string) => name, get: () => ({ fetch }) } as unknown as DurableObjectNamespace;
    const api = createApp({
      realtimeTicket: {
        resolveSession: async () => actor,
        resolveRealtimeSession: async () => ({ userId: "alice", sessionId: "session", expiresAt: new Date("2099-09-28T01:00:00.000Z") }),
        tickets: { issue },
        webSocketUrl: "wss://api.example.test/api/v1/realtime/connect",
        hasUsername: async () => false,
      },
      pushDevices: {
        resolveSession: async () => actor,
        resolvePushSession: async () => ({ userId: "alice", sessionId: "session" }),
        devices: { register, unregister: async () => undefined },
        hasUsername: async () => false,
      },
      realtimeConnect: {
        tickets: { consume: async () => ({ userId: "alice", sessionId: "session", expiresAt: new Date("2099-09-28T00:01:00.000Z"), sessionExpiresAt: new Date("2099-09-28T01:00:00.000Z") }) },
        resolveActiveSession: async () => ({ userId: "alice", sessionId: "session", expiresAt: new Date("2099-09-28T01:00:00.000Z") }),
        userRealtime: namespace,
        trustedOrigins: ["https://web.example.test"],
        hasUsername: async () => false,
      },
    });

    expect((await api.request("/api/v1/realtime/tickets", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" })).status).toBe(403);
    expect((await api.request("/api/v1/push/devices/install", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ token: "a-valid-provider-token", platform: "ios", optedIn: true }) })).status).toBe(403);
    expect((await api.request("/api/v1/realtime/connect?ticket=ticket", { headers: { Upgrade: "websocket", Origin: "https://web.example.test" } })).status).toBe(403);
    expect(issue).not.toHaveBeenCalled();
    expect(register).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("keeps ticket and push OpenAPI paths available but safely unavailable without Worker bindings", async () => {
    const api = createApp();
    expect((await api.request("/api/v1/realtime/tickets", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" })).status).toBe(401);
    expect((await api.request("/api/v1/realtime/connect", { headers: { Upgrade: "websocket" } })).status).toBe(503);
  });
});
