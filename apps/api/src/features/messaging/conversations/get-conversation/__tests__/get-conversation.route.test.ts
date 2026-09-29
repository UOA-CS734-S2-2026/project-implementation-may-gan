import { describe, expect, it, vi } from "vitest";
import { createApp } from "../../../../../app";

describe("get conversation route", () => {
  it("returns unavailable when the repository is not configured", async () => {
    const api = createApp({ messaging: { resolveSession: async () => ({ userId: "alice" }) } });
    const response = await api.request("/api/v1/conversations/c1");
    expect(response.status).toBe(503);
  });

  it("calls the injected repository", async () => {
    const getConversation = { get: vi.fn(async () => ({ id: "c1" })) };
    const api = createApp({ messaging: { resolveSession: async () => ({ userId: "alice" }), getConversation } });
    const response = await api.request("/api/v1/conversations/c1");
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(getConversation.get).toHaveBeenCalledWith("alice", "c1");
  });
});
