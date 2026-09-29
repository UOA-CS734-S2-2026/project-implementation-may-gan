import { describe, expect, it, vi } from "vitest";
import { createApp } from "../../../../../app";

describe("get messaging unread route", () => {
  it("returns unavailable when the repository is not configured", async () => {
    const api = createApp({ messaging: { resolveSession: async () => ({ userId: "alice" }) } });
    const response = await api.request("/api/v1/messaging/unread");
    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("calls the action-local repository", async () => {
    const get = vi.fn(async () => ({ inboxCount: 2, requestCount: 1 }));
    const api = createApp({
      messaging: {
        resolveSession: async () => ({ userId: "alice" }),
        getMessagingUnread: { get },
      },
    });

    const response = await api.request("/api/v1/messaging/unread");

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ inboxCount: 2, requestCount: 1 });
    expect(get).toHaveBeenCalledWith("alice");
  });
});
