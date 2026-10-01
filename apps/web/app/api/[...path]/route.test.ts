import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  enabled: true,
  transport: vi.fn(),
  forward: vi.fn(),
}));
vi.mock("@/lib/api/config", () => ({ get browserProxyEnabled() { return mocks.enabled; } }));
vi.mock("@/lib/api/server/transport", () => ({ browserApiTransport: mocks.transport }));
vi.mock("@/lib/api/server/browser-proxy", () => ({ forwardBrowserApiRequest: mocks.forward }));

import { GET, POST } from "./route";

beforeEach(() => {
  mocks.enabled = true;
  mocks.transport.mockReset();
  mocks.forward.mockReset();
});

describe("browser API proxy route", () => {
  it("is inert while proxy mode is disabled even if a binding is staged", async () => {
    mocks.enabled = false;
    mocks.transport.mockResolvedValue({ fetch: vi.fn() });
    mocks.forward.mockResolvedValue(new Response(null, { headers: { "set-cookie": "session=should-not-leak" } }));

    for (const [handler, method] of [[GET, "GET"], [POST, "POST"]] as const) {
      const response = await handler(new Request("https://web.example.test/api/auth/get-session", { method }));
      expect(response.status).toBe(404);
      expect(response.headers.get("cache-control")).toBe("no-store");
      expect(response.headers.get("set-cookie")).toBeNull();
    }
    expect(mocks.transport).not.toHaveBeenCalled();
    expect(mocks.forward).not.toHaveBeenCalled();
  });

  it("loads and forwards only after browser proxy mode is enabled", async () => {
    mocks.transport.mockResolvedValue({ fetch: vi.fn() });
    mocks.forward.mockResolvedValue(new Response("ok", { headers: { "cache-control": "no-store" } }));

    const response = await GET(new Request("https://web.example.test/api/auth/get-session"));
    expect(response.status).toBe(200);
    expect(mocks.transport).toHaveBeenCalledOnce();
    expect(mocks.forward).toHaveBeenCalledOnce();
  });
});
