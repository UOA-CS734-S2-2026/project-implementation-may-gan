import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";

const webOrigin = "https://web.integration.test";
const apiOrigin = "https://api.integration.test";
const sourceIp = "2001:db8::7";

const bindings = env as unknown as {
  WEB_PROXY_FIXTURE: { fetch(request: Request): Promise<Response> };
  DIRECT_API: { fetch(request: Request): Promise<Response> };
  DIRECT_BROWSER_PROXY: { fetch(request: Request): Promise<Response> };
};

function browserRequest(init: RequestInit = {}): RequestInit {
  const headers = new Headers(init.headers);
  headers.set("origin", webOrigin);
  headers.set("x-dayli-test-edge-source", sourceIp);
  return { ...init, headers };
}

describe("BrowserProxyEntrypoint through a workerd service binding", () => {
  it("rejects Worker-originated public and web-proxy requests", async () => {
    const headers = { "cf-worker": "agroupforcoders.com", "cf-connecting-ip": "203.0.113.10" };
    const direct = await bindings.DIRECT_API.fetch(new Request(`${apiOrigin}/api/auth/get-session`, { headers }));
    expect(direct.status).toBe(403);
    const proxied = await bindings.WEB_PROXY_FIXTURE.fetch(new Request(`${webOrigin}/api/auth/get-session`, browserRequest({ headers })));
    expect(proxied.status).toBe(403);
  });

  it("uses the named entrypoint and keeps its private context out of the public API handler", async () => {
    const forged = await bindings.DIRECT_API.fetch(new Request(`${apiOrigin}/api/auth/get-session`, {
      headers: {
        "x-dayli-browser-source": sourceIp,
        "x-dayli-browser-request-id": "a".repeat(32),
      },
    }));
    expect(forged.status).toBe(503);

    const malformedPrivateContext = await bindings.DIRECT_BROWSER_PROXY.fetch(new Request(`${webOrigin}/api/v1/health`));
    expect(malformedPrivateContext.status).toBe(400);
    expect(malformedPrivateContext.headers.get("cache-control")).toBe("no-store");

    const acceptedPrivateContext = await bindings.DIRECT_BROWSER_PROXY.fetch(new Request(`${apiOrigin}/api/auth/get-session`, {
      headers: {
        "x-dayli-browser-source": sourceIp,
        "x-dayli-browser-request-id": "a".repeat(32),
      },
    }));
    // Auth is absent from this database-free fixture. Reaching its 404 proves
    // that only the named entrypoint accepts and converts the private context.
    expect(acceptedPrivateContext.status).toBe(404);

    const health = await bindings.WEB_PROXY_FIXTURE.fetch(new Request(`${webOrigin}/api/v1/health`, browserRequest({
      headers: { "cf-connecting-ip": "198.51.100.9", "x-forwarded-for": "198.51.100.10" },
    })));
    expect(health.status).toBe(200);
    expect(health.headers.get("cache-control")).toBe("no-store");

  });
});
