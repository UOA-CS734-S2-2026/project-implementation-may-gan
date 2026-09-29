import { describe, expect, it } from "vitest";
import { createApp } from "../../../../../app";

describe("mark conversation read route", () => {
  it("returns unavailable when the action repository is not configured", async () => {
    const api = createApp({ messaging: { resolveSession: async () => ({ userId: "alice" }) } });
    const response = await api.request("/api/v1/conversations/c1/read", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ throughSequence: "1" }),
    });
    expect(response.status).toBe(503);
  });

  it("uses the action repository and preserves the no-store response", async () => {
    const markRead = async () => ({ lastReadSequence: "1", receiptSequence: "1", unreadCount: 0 });
    const api = createApp({
      messaging: {
        resolveSession: async () => ({ userId: "alice" }),
        markConversationRead: { markRead },
      },
    });
    const response = await api.request("/api/v1/conversations/c1/read", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ throughSequence: "1" }),
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual({ lastReadSequence: "1", receiptSequence: "1", unreadCount: 0 });
  });
});
