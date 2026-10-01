import { describe, expect, it, vi } from "vitest";
import { createApp } from "../../app";

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

  it("allows a trusted origin to preflight credentialed PUT messaging mutations", async () => {
    const response = await app().request("/api/v1/conversations/conversation-1/read", {
      method: "OPTIONS",
      headers: { origin, "access-control-request-method": "PUT", "access-control-request-headers": "content-type" },
    });

    expect(response.status).toBe(204);
    expect(response.headers.get("access-control-allow-methods")).toContain("PUT");
  });

  it("allows a trusted origin to preflight a username change", async () => {
    const response = await app().request("/api/v1/profile/username", {
      method: "OPTIONS",
      headers: { origin, "access-control-request-method": "PUT", "access-control-request-headers": "content-type" },
    });

    expect(response.status).toBe(204);
    expect(response.headers.get("access-control-allow-origin")).toBe(origin);
    expect(response.headers.get("access-control-allow-methods")).toContain("PUT");
  });

  it("allows a trusted origin to preflight setting a profile photo", async () => {
    const response = await app().request("/api/v1/profile/avatar", {
      method: "OPTIONS",
      headers: { origin, "access-control-request-method": "PUT", "access-control-request-headers": "content-type" },
    });

    expect(response.status).toBe(204);
    expect(response.headers.get("access-control-allow-origin")).toBe(origin);
    expect(response.headers.get("access-control-allow-methods")).toContain("PUT");
  });

  it.each([
    ["an untrusted origin", { origin: "https://evil.test", "access-control-request-method": "POST" }],
    ["an unlisted method", { origin, "access-control-request-method": "TRACE" }],
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
    expect(response.headers.get("access-control-expose-headers")).toContain("idempotent-replayed");
    expect(response.headers.get("access-control-expose-headers")).toContain("retry-after");
    expect(response.headers.get("vary")).toContain("Origin");
  });

  it("adds CORS headers when a route returns an immutable redirect response", async () => {
    const api = app();
    api.get("/api/v1/cors-redirect", () => Response.redirect("https://example.test/next"));

    const response = await api.request("/api/v1/cors-redirect", { headers: { origin }, redirect: "manual" });

    expect(response.status).toBe(302);
    expect(response.headers.get("access-control-allow-origin")).toBe(origin);
    expect(response.headers.get("vary")).toContain("Origin");
  });

  it("does not grant CORS to an untrusted safe request", async () => {
    const response = await app().request("/api/v1/health", { headers: { origin: "https://evil.test" } });

    expect(response.status).toBe(200);
    expect(response.headers.get("access-control-allow-origin")).toBeNull();
  });

  it.each([
    ["cross-site", "https://evil.test"],
    ["sibling-site", "https://other.dayli.test"],
    ["malformed", "not an origin"],
    ["opaque", "null"],
  ])("rejects a %s actual form POST before a cookie-authenticated relationship service runs", async (_name, requestOrigin) => {
    const acceptRequest = vi.fn(async () => ({ userId: "user-2", status: "friends" as const, incomingRequest: null, outgoingRequest: null }));
    const api = createApp({
      trustedOrigins: [origin],
      relationships: {
        resolveSession: async () => ({ userId: "user-1" }),
        service: { acceptRequest } as never,
      },
    });

    const response = await api.request("/api/v1/relationships/requests/request-1/accept", {
      method: "POST",
      headers: {
        origin: requestOrigin,
        cookie: "better-auth.session_token=opaque",
        authorization: "Bearer native-signed-token",
        "content-type": "application/x-www-form-urlencoded",
      },
      body: "ignored=form-body",
    });

    expect(response.status).toBe(403);
    expect(response.headers.get("access-control-allow-origin")).toBeNull();
    expect(acceptRequest).not.toHaveBeenCalled();
  });

  it("rejects an origin-less browser session cookie before a relationship service runs", async () => {
    const acceptRequest = vi.fn();
    const api = createApp({
      trustedOrigins: [origin],
      relationships: {
        resolveSession: async () => ({ userId: "user-1" }),
        service: { acceptRequest } as never,
      },
    });

    const response = await api.request("/api/v1/relationships/requests/request-1/accept", {
      method: "POST",
      headers: { cookie: "__Secure-better-auth.session_token=opaque" },
    });

    expect(response.status).toBe(403);
    expect(acceptRequest).not.toHaveBeenCalled();
  });

  it("allows a trusted browser mutation and an origin-less native bearer mutation", async () => {
    const acceptRequest = vi.fn(async () => ({ userId: "user-2", status: "friends" as const, incomingRequest: null, outgoingRequest: null }));
    const api = createApp({
      trustedOrigins: [origin],
      relationships: {
        resolveSession: async () => ({ userId: "user-1" }),
        service: { acceptRequest } as never,
      },
    });

    const browser = await api.request("/api/v1/relationships/requests/request-1/accept", {
      method: "POST",
      headers: { origin, cookie: "better-auth.session_token=opaque" },
    });
    const native = await api.request("/api/v1/relationships/requests/request-2/accept", {
      method: "POST",
      headers: { authorization: "Bearer native-signed-token" },
    });

    expect(browser.status).toBe(200);
    expect(browser.headers.get("access-control-allow-origin")).toBe(origin);
    expect(native.status).toBe(200);
    expect(native.headers.get("access-control-allow-origin")).toBeNull();
    expect(acceptRequest).toHaveBeenNthCalledWith(1, "user-1", "request-1");
    expect(acceptRequest).toHaveBeenNthCalledWith(2, "user-1", "request-2");
  });
});
