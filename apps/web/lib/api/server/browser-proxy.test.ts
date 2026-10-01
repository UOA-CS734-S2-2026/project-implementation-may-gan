import { describe, expect, it, vi } from "vitest";
import { forwardBrowserApiRequest, selectBrowserSource, type ApiTransport } from "./browser-proxy";

function browserRequest(headers: HeadersInit = {}, body?: BodyInit | null): Request {
  return new Request("https://web.example.test/api/auth/callback/google?code=redacted", {
    method: body === undefined ? "GET" : "POST",
    headers: { "cf-connecting-ip": "2001:db8::7", ...headers },
    body,
  });
}

describe("browser API proxy", () => {
  it("passes cookies, origin, request bodies, redirects, and individual Set-Cookie values through a fixed transport", async () => {
    const transport: ApiTransport = {
      fetch: vi.fn(async (request: Request) => {
        expect(request.url).toBe("https://web.example.test/api/auth/callback/google?code=redacted");
        expect(request.redirect).toBe("manual");
        expect(request.headers.get("cookie")).toBe("better-auth.session_token=opaque");
        expect(request.headers.get("origin")).toBe("https://web.example.test");
        expect(request.headers.get("authorization")).toBe("Bearer native-token");
        expect(request.headers.get("idempotency-key")).toBe("request-123");
        expect(request.headers.get("cf-connecting-ip")).toBeNull();
        expect(request.headers.get("x-forwarded-for")).toBeNull();
        expect(request.headers.get("x-real-ip")).toBeNull();
        expect(request.headers.get("forwarded")).toBeNull();
        expect(request.headers.get("x-dayli-browser-source")).toBe("198.51.100.19");
        expect(request.headers.get("x-dayli-browser-request-id")).toMatch(/^[a-z0-9]{32}$/);
        await expect(request.text()).resolves.toBe('{"email":"person@example.test"}');

        const headers = new Headers({ location: "https://web.example.test/home" });
        headers.append("set-cookie", "session=one; Path=/; HttpOnly; Secure");
        headers.append("set-cookie", "session=; Path=/; Max-Age=0; HttpOnly; Secure");
        return new Response("redirecting", { status: 302, headers });
      }),
    };

    const response = await forwardBrowserApiRequest(browserRequest({
      cookie: "better-auth.session_token=opaque",
      origin: "https://web.example.test",
      authorization: "Bearer native-token",
      "idempotency-key": "request-123",
      "cf-connecting-ip": "198.51.100.19",
      "x-forwarded-for": "198.51.100.1",
      "x-real-ip": "198.51.100.2",
      forwarded: "for=198.51.100.3",
      connection: "keep-alive",
    }, JSON.stringify({ email: "person@example.test" })), transport);

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("https://web.example.test/home");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.getSetCookie()).toEqual([
      "session=one; Path=/; HttpOnly; Secure",
      "session=; Path=/; Max-Age=0; HttpOnly; Secure",
    ]);
    await expect(response.text()).resolves.toBe("redirecting");
  });

  it("rejects WebSocket upgrades and missing or invalid edge identity", async () => {
    const transport = { fetch: vi.fn() };

    expect((await forwardBrowserApiRequest(browserRequest({ upgrade: "websocket" }), transport)).status).toBe(426);
    expect((await forwardBrowserApiRequest(new Request("https://web.example.test/api/v1/feed"), transport)).status).toBe(503);
    expect((await forwardBrowserApiRequest(browserRequest({ "cf-connecting-ip": "198.51.100.1, 198.51.100.2" }), transport)).status).toBe(503);
    expect(transport.fetch).not.toHaveBeenCalled();
  });

  it("selects only the Cloudflare ingress header, not client forwarding headers", () => {
    expect(selectBrowserSource(browserRequest({
      "cf-connecting-ip": "203.0.113.8",
      "x-forwarded-for": "198.51.100.1",
      "x-real-ip": "198.51.100.2",
    }))).toEqual({ ok: true, sourceIp: "203.0.113.8" });
    expect(selectBrowserSource(browserRequest({ "cf-connecting-ip": "unknown", "x-forwarded-for": "203.0.113.8" }))).toEqual({ ok: false });
  });
});
