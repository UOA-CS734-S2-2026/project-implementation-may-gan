import { describe, expect, it } from "vitest";
import { createApp } from "../../../../app";

describe("resolve message request route", () => {
  it("returns unavailable when the reader is not configured", async () => {
    const api = createApp({ messaging: { resolveSession: async () => ({ userId: "alice" }) } });
    const response = await api.request("/api/v1/conversations/c1/request", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ decision: "accept" }),
    });
    expect(response.status).toBe(503);
  });
});
