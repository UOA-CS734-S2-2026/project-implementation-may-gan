import { describe, expect, it, vi } from "vitest";
import { createApp } from "../../../../../app";

describe("get message route", () => {
  it("returns unavailable when the repository is not configured", async () => {
    const api = createApp({ messaging: { resolveSession: async () => ({ userId: "alice" }) } });
    const response = await api.request("/api/v1/conversations/c1/messages/m1");
    expect(response.status).toBe(503);
  });

  it("delegates to the action repository", async () => {
    const getMessage = { get: vi.fn(async () => ({
      id: "m1", conversationId: "c1", sequence: "1", senderId: "alice", clientMessageId: "client-1",
      text: "hello", replyToMessageId: null, replyPreview: null, version: 1,
      createdAt: "2026-09-28T00:00:00.000Z", editedAt: null, unsentAt: null, reactions: [],
    })) };
    const api = createApp({ messaging: { resolveSession: async () => ({ userId: "alice" }), getMessage } });

    const response = await api.request("/api/v1/conversations/c1/messages/m1");

    expect(response.status).toBe(200);
    expect(getMessage.get).toHaveBeenCalledWith("alice", "c1", "m1");
  });
});
