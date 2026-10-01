import { describe, expect, it, vi } from "vitest";
import { resolveServerSession } from "./server";

const sourceHeaders = new Headers({ "cf-connecting-ip": "203.0.113.7", cookie: "session=old" });

describe("resolveServerSession", () => {
  it("uses the private proxy and returns a validated session", async () => {
    const fetch = vi.fn(async (request: Request) => {
      expect(request.headers.get("x-dayli-browser-source")).toBe("203.0.113.7");
      expect(request.headers.get("cookie")).toBe("session=old");
      return Response.json({ user: { id: "user_1" }, session: { id: "session_1" } });
    });

    await expect(resolveServerSession(sourceHeaders, { fetch })).resolves.toEqual({
      state: "authenticated", value: { user: { id: "user_1" }, session: { id: "session_1" } },
    });
  });

  it.each(["missing", "invalid", "expired", "revoked"])("treats Better Auth's 200 null response for a %s session as signed out", async () => {
    await expect(resolveServerSession(sourceHeaders, { fetch: async () => Response.json(null) }))
      .resolves.toEqual({ state: "signed-out" });
  });

  it("treats malformed JSON and an invalid successful response shape as unavailable", async () => {
    await expect(resolveServerSession(sourceHeaders, {
      fetch: async () => new Response("not json", { headers: { "content-type": "application/json" } }),
    })).resolves.toEqual({ state: "unavailable" });
    await expect(resolveServerSession(sourceHeaders, {
      fetch: async () => Response.json({ user: { id: "user_1" } }),
    })).resolves.toEqual({ state: "unavailable" });
  });

  it("does not discard a session refresh cookie in a server component", async () => {
    const result = await resolveServerSession(sourceHeaders, {
      fetch: async () => Response.json({ user: {}, session: {} }, { headers: { "set-cookie": "session=new; Path=/; HttpOnly" } }),
    });

    expect(result).toEqual({ state: "cookie-mutation-required" });
  });

  it.each(["agroupforcoders.com", ""])("preserves Worker provenance %j when constructing session requests", async (marker) => {
    const headers = new Headers(sourceHeaders);
    headers.set("cf-worker", marker);
    const fetch = vi.fn();
    await expect(resolveServerSession(headers, { fetch })).resolves.toEqual({ state: "unavailable" });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("does not treat a missing source proof as signed out", async () => {
    await expect(resolveServerSession(new Headers({ cookie: "session=old" }), { fetch: vi.fn() }))
      .resolves.toEqual({ state: "unavailable" });
  });
});
