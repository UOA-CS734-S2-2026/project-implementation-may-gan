import { describe, expect, it, vi } from "vitest";
import { createApp } from "../../../../../app";

describe("list conversation changes route", () => {
  it("returns unavailable when the repository is not configured", async () => {
    const api = createApp({ messaging: { resolveSession: async () => ({ userId: "alice" }) } });
    const response = await api.request("/api/v1/conversations/c1/changes?limit=100");
    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("calls the action-local repository", async () => {
    const list = vi.fn(async () => ({
      items: [],
      nextChangeSequence: null,
      hasMore: false,
      highWatermark: "0",
    }));
    const api = createApp({
      messaging: {
        resolveSession: async () => ({ userId: "alice" }),
        listConversationChanges: { list },
      },
    });

    const response = await api.request("/api/v1/conversations/c1/changes?afterChangeSequence=7&limit=2");

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      items: [],
      nextChangeSequence: null,
      hasMore: false,
      highWatermark: "0",
    });
    expect(list).toHaveBeenCalledWith("alice", "c1", "7", 2);
  });
});
