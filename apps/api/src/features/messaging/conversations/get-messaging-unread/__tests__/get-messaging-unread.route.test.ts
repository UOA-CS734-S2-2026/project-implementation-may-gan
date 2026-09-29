import { describe, expect, it } from "vitest";
import { createApp } from "../../../../../app";

describe("get messaging unread route", () => {
  it("returns unavailable when the reader is not configured", async () => {
    const api = createApp({ messaging: { resolveSession: async () => ({ userId: "alice" }) } });
    const response = await api.request("/api/v1/messaging/unread");
    expect(response.status).toBe(503);
  });
});
