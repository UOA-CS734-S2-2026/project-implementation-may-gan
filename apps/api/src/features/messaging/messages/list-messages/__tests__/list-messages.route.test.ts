import { describe, expect, it, vi } from "vitest";
import { createApp } from "../../../../../app";

describe("list messages route", () => {
  it("returns unavailable when the repository is not configured", async () => {
    const api = createApp({ messaging: { resolveSession: async () => ({ userId: "alice" }) } });
    const response = await api.request("/api/v1/conversations/c1/messages?limit=50");
    expect(response.status).toBe(503);
  });

  it("calls the injected repository", async () => {
    const listMessages = { list: vi.fn(async () => ({ items: [], nextCursor: null, hasMore: false })) };
    const api = createApp({ messaging: { resolveSession: async () => ({ userId: "alice" }), listMessages } });
    const response = await api.request("/api/v1/conversations/c1/messages?beforeSequence=9&limit=2");
    expect(response.status).toBe(200);
    expect(listMessages.list).toHaveBeenCalledWith("alice", "c1", "9", undefined, 2);
  });
});
