import { describe, expect, it, vi } from "vitest";
import { createApp } from "../../../../../app";

describe("connect realtime route", () => {
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
      },
    });
    const response = await api.request("/api/v1/realtime/connect?ticket=ticket", {
      headers: { Upgrade: "websocket", Origin: "https://web.example.test" },
    });
    expect(response.status).toBe(200);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("reports unavailable when the Worker binding is absent", async () => {
    const response = await createApp().request("/api/v1/realtime/connect", { headers: { Upgrade: "websocket" } });
    expect(response.status).toBe(503);
  });
});
