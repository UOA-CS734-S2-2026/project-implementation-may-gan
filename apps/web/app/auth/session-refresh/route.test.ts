import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  enabled: true,
  transport: vi.fn(),
  forward: vi.fn(),
}));
vi.mock("@/lib/api/config", () => ({ get browserProxyEnabled() { return mocks.enabled; } }));
vi.mock("@/lib/api/server/transport", () => ({ browserApiTransport: mocks.transport }));
vi.mock("@/lib/api/server/browser-proxy", () => ({ forwardBrowserApiRequest: mocks.forward }));

import { GET } from "./route";

beforeEach(() => {
  mocks.enabled = true;
  mocks.transport.mockReset();
  mocks.forward.mockReset();
});

describe("session refresh route", () => {
  it("is inert while browser proxy mode is disabled, even with a staged binding", async () => {
    mocks.enabled = false;
    mocks.transport.mockResolvedValue({ fetch: vi.fn() });
    mocks.forward.mockResolvedValue(Response.json({ user: {}, session: {} }, { headers: { "set-cookie": "session=renewed" } }));

    const response = await GET(new Request("https://web.example.test/auth/session-refresh?returnTo=%2Fhome"));
    expect(response.status).toBe(404);
    expect(response.headers.get("location")).toBeNull();
    expect(response.headers.get("set-cookie")).toBeNull();
    expect(mocks.transport).not.toHaveBeenCalled();
    expect(mocks.forward).not.toHaveBeenCalled();
  });

  it("preserves a valid API cookie mutation on a redirect response", async () => {
    mocks.transport.mockResolvedValue({ fetch: vi.fn() });
    mocks.forward.mockResolvedValue(Response.json({ user: { id: "user_1" }, session: { id: "session_1" } }, {
      headers: { "set-cookie": "session=renewed; Path=/; HttpOnly" },
    }));

    const response = await GET(new Request("https://web.example.test/auth/session-refresh?returnTo=%2Fmessages"));
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("/messages");
    expect(response.headers.get("set-cookie")).toContain("session=renewed");
    expect(response.headers.get("set-cookie")).toContain("dayli_session_refresh_attempt=1");
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("returns Better Auth's null session response to the safe destination after preserving cookie deletion", async () => {
    mocks.transport.mockResolvedValue({ fetch: vi.fn() });
    mocks.forward.mockResolvedValue(Response.json(null, { headers: { "set-cookie": "session=; Max-Age=0" } }));

    const response = await GET(new Request("https://web.example.test/auth/session-refresh?returnTo=https%3A%2F%2Fattacker.example"));
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("/");
    expect(response.headers.get("set-cookie")).toContain("session=; Max-Age=0");
  });

  it("rejects encoded path normalization that would become a protocol-relative redirect", async () => {
    mocks.transport.mockResolvedValue({ fetch: vi.fn() });
    mocks.forward.mockImplementation(async () => Response.json({ user: {}, session: {} }));
    for (const returnTo of ["/%2e%2e//attacker.example", "/%252e%252e//attacker.example"]) {
      const response = await GET(new Request(`https://web.example.test/auth/session-refresh?returnTo=${encodeURIComponent(returnTo)}`));
      expect(response.headers.get("location")).toBe("/");
    }
  });

  it("preserves multiple API cookies while keeping a safe normalized path and query", async () => {
    mocks.transport.mockResolvedValue({ fetch: vi.fn() });
    const responseHeaders = new Headers();
    responseHeaders.append("set-cookie", "session=renewed; Path=/; HttpOnly");
    responseHeaders.append("set-cookie", "session_meta=renewed; Path=/; HttpOnly");
    mocks.forward.mockResolvedValue(Response.json({ user: {}, session: {} }, { headers: responseHeaders }));
    const response = await GET(new Request("https://web.example.test/auth/session-refresh?returnTo=%2Fmessages%3Ftab%3Dinbox"));
    expect(response.headers.get("location")).toBe("/messages?tab=inbox");
    const cookies = (response.headers as Headers & { getSetCookie?: () => string[] }).getSetCookie?.() ?? [];
    expect(cookies).toEqual(expect.arrayContaining([
      expect.stringContaining("session=renewed"),
      expect.stringContaining("session_meta=renewed"),
      expect.stringContaining("dayli_session_refresh_attempt=1"),
    ]));
  });

  it("does not redirect through unavailable or malformed API responses", async () => {
    mocks.transport.mockResolvedValue(undefined);
    mocks.forward.mockResolvedValue(Response.json({ error: "unavailable" }, { status: 503 }));
    await expect(GET(new Request("https://web.example.test/auth/session-refresh"))).resolves.toMatchObject({ status: 503 });

    mocks.forward.mockResolvedValue(new Response("bad", { headers: { "content-type": "application/json" } }));
    await expect(GET(new Request("https://web.example.test/auth/session-refresh"))).resolves.toMatchObject({ status: 502 });
  });
});
