import { describe, expect, it } from "vitest";
import { createApp } from "../../../../app";

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
});
