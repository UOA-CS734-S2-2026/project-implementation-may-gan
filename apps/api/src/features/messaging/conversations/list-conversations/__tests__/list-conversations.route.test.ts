import { describe, expect, it, vi } from "vitest";
import { createApp } from "../../../../../app";

describe("list conversations route", () => {
  it("does not expose unavailable storage as an empty inbox", async () => {
    const api = createApp({ messaging: { resolveSession: async () => ({ userId: "alice" }) } });
    const response = await api.request("/api/v1/conversations?folder=inbox");
    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("denies an unauthenticated inbox request before storage is used", async () => {
    const api = createApp({ messaging: { resolveSession: async () => null } });
    const response = await api.request("/api/v1/conversations?folder=inbox");
    expect(response.status).toBe(401);
  });

  it("uses the action-local list capability", async () => {
    const list = vi.fn(async () => ({ items: [], nextCursor: null }));
    const api = createApp({
      messaging: {
        resolveSession: async () => ({ userId: "alice" }),
        listConversations: { list },
      },
    });

    const response = await api.request("/api/v1/conversations?folder=requests&cursor=cursor&limit=2");

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ items: [], nextCursor: null });
    expect(list).toHaveBeenCalledWith("alice", "requests", "cursor", 2);
  });
});
