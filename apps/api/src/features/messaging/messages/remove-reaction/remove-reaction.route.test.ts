import { describe, expect, it } from "vitest";
import { createApp } from "../../../../app";

describe("remove message reaction route", () => {
  it("keeps the action unavailable instead of invoking an absent service", async () => {
    const api = createApp({ messaging: { resolveSession: async () => ({ userId: "alice" }) } });
    const response = await api.request("/api/v1/conversations/c1/messages/m1/reaction", { method: "DELETE" });
    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("no-store");
  });
});
