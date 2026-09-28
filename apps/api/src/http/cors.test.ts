import { describe, expect, it } from "vitest";
import { createApp } from "../app";

const origin = "https://web.dayli.test";
const app = () => createApp({
  trustedOrigins: [origin],
  posts: { resolveSession: async () => null },
});

describe("application CORS", () => {
  it("allows a trusted origin to preflight a credentialed post submission", async () => {
    const response = await app().request("/api/v1/posts", {
      method: "OPTIONS",
      headers: {
        origin,
        "access-control-request-method": "POST",
        "access-control-request-headers": "content-type, idempotency-key",
      },
    });

    expect(response.status).toBe(204);
    expect(response.headers.get("access-control-allow-origin")).toBe(origin);
    expect(response.headers.get("access-control-allow-credentials")).toBe("true");
    expect(response.headers.get("access-control-allow-headers")).toContain("idempotency-key");
  });

  it.each([
    ["an untrusted origin", { origin: "https://evil.test", "access-control-request-method": "POST" }],
    ["an unlisted method", { origin, "access-control-request-method": "PUT" }],
    ["an unlisted header", { origin, "access-control-request-method": "POST", "access-control-request-headers": "x-user-id" }],
  ])("rejects a preflight from %s", async (_name, headers) => {
    const response = await app().request("/api/v1/posts", { method: "OPTIONS", headers });

    expect(response.status).toBe(403);
    expect(response.headers.get("access-control-allow-origin")).toBeNull();
  });

  it("adds CORS headers to trusted responses, including errors, and exposes the replay header", async () => {
    const response = await app().request("/api/v1/posting-days/current", { headers: { origin } });

    expect(response.status).toBe(401);
    expect(response.headers.get("access-control-allow-origin")).toBe(origin);
    expect(response.headers.get("access-control-expose-headers")).toBe("idempotent-replayed");
    expect(response.headers.get("vary")).toContain("Origin");
  });

  it("does not grant CORS to an untrusted origin", async () => {
    const response = await app().request("/api/v1/posting-days/current", { headers: { origin: "https://evil.test" } });

    expect(response.headers.get("access-control-allow-origin")).toBeNull();
  });
});
