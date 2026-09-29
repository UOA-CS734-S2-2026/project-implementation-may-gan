import { describe, expect, it } from "vitest";
import { createApp } from "../../../../../app";

describe("resolve message request route", () => {
  it("returns unavailable when the action repository is not configured", async () => {
    const api = createApp({ messaging: { resolveSession: async () => ({ userId: "alice" }) } });
    const response = await api.request("/api/v1/conversations/c1/request", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ decision: "accept" }),
    });
    expect(response.status).toBe(503);
  });

  it("uses the action repository and preserves the no-store response", async () => {
    const resolve = async () => ({ id: "c1", requestState: "active" });
    const api = createApp({
      messaging: {
        resolveSession: async () => ({ userId: "alice" }),
        resolveMessageRequest: { resolve },
      },
    });
    const response = await api.request("/api/v1/conversations/c1/request", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ decision: "accept" }),
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual({ id: "c1", requestState: "active" });
  });
});
