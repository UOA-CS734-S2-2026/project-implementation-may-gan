import { describe, expect, it } from "vitest";
import { createApp } from "../../../../app";

describe("list messages route", () => {
  it("returns unavailable when the reader is not configured", async () => {
    const api = createApp({ messaging: { resolveSession: async () => ({ userId: "alice" }) } });
    const response = await api.request("/api/v1/conversations/c1/messages?limit=50");
    expect(response.status).toBe(503);
  });
});
