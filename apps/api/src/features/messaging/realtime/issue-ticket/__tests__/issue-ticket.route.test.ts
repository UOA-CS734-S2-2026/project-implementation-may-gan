import { describe, expect, it, vi } from "vitest";
import { createApp } from "../../../../../app";

describe("issue realtime ticket route", () => {
  it("issues a ticket from the verified realtime session", async () => {
    const issue = vi.fn(async () => ({ ticket: "ticket", expiresAt: new Date("2099-09-28T00:01:00.000Z") }));
    const api = createApp({
      realtimeTicket: {
        resolveSession: async () => ({ userId: "alice" }),
        resolveRealtimeSession: async () => ({ userId: "alice", sessionId: "session", expiresAt: new Date("2099-09-28T01:00:00.000Z") }),
        tickets: { issue },
        webSocketUrl: "wss://api.example.test/api/v1/realtime/connect",
      },
    });
    const response = await api.request("/api/v1/realtime/tickets", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    expect(response.status).toBe(201);
    expect(issue).toHaveBeenCalledWith(expect.objectContaining({ userId: "alice", sessionId: "session" }));
  });
});
