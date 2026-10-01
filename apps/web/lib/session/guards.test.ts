import { describe, expect, it, vi } from "vitest";
import { hasSessionRefreshAttempt, requireUsernameReady, resolveLanding, safeReturnPath, sessionGuard } from "./guards";

const headers = new Headers({ "cf-connecting-ip": "203.0.113.7", cookie: "session=valid" });

describe("server session guards", () => {
  it("uses only safe relative return destinations", () => {
    expect(safeReturnPath("/messages/new?draft=1")).toBe("/messages/new?draft=1");
    expect(safeReturnPath("//attacker.example")).toBe("/");
    expect(safeReturnPath("/\\attacker.example")).toBe("/");
    expect(safeReturnPath("https://attacker.example")).toBe("/");
    expect(safeReturnPath("/%2e%2e//attacker.example")).toBe("/");
    expect(safeReturnPath("/%252e%252e//attacker.example")).toBe("/");
  });

  it("does not treat a refresh-loop marker as authentication", () => {
    expect(hasSessionRefreshAttempt(new Headers({ cookie: "dayli_session_refresh_attempt=1" }))).toBe(true);
    expect(sessionGuard({ state: "cookie-mutation-required" }, "/home", false)).toEqual({
      state: "redirect", location: "/auth/session-refresh?returnTo=%2Fhome",
    });
    expect(sessionGuard({ state: "cookie-mutation-required" }, "/home", true)).toEqual({ state: "unavailable" });
  });

  it("redirects signed-out sessions and keeps transport failures unavailable", () => {
    expect(sessionGuard({ state: "signed-out" }, "/messages/new", false)).toEqual({
      state: "redirect", location: "/sign-in?next=%2Fmessages%2Fnew",
    });
    expect(sessionGuard({ state: "unavailable" }, "/home", false)).toEqual({ state: "unavailable" });
  });

  it("renders the public landing for signed-out, expired, and unavailable requests", async () => {
    for (const session of [Response.json(null), new Response("bad", { headers: { "content-type": "application/json" } })]) {
      const fetch = vi.fn().mockResolvedValue(session);
      await expect(resolveLanding(headers, { fetch })).resolves.toEqual({ state: "render" });
    }
  });

  it("redirects an authenticated landing visitor by username readiness", async () => {
    const ready = vi.fn()
      .mockResolvedValueOnce(Response.json({ user: { id: "user_1" }, session: { id: "session_1" } }))
      .mockResolvedValueOnce(Response.json({ needsUsernameSetup: false }));
    await expect(resolveLanding(headers, { fetch: ready })).resolves.toEqual({ state: "redirect", location: "/home" });

    const setup = vi.fn()
      .mockResolvedValueOnce(Response.json({ user: { id: "user_1" }, session: { id: "session_1" } }))
      .mockResolvedValueOnce(Response.json({ needsUsernameSetup: true }));
    await expect(resolveLanding(headers, { fetch: setup })).resolves.toEqual({ state: "redirect", location: "/setup-username" });
  });

  it("returns an expired landing cookie deletion to the public landing, while protected guards redirect", async () => {
    const expired = new Headers({ "cf-connecting-ip": "203.0.113.7", cookie: "session=expired" });
    await expect(resolveLanding(expired, {
      fetch: vi.fn().mockResolvedValue(Response.json(null, { headers: { "set-cookie": "session=; Max-Age=0; Path=/" } })),
    })).resolves.toEqual({ state: "redirect", location: "/auth/session-refresh?returnTo=%2F" });

    const afterDeletion = new Headers({ "cf-connecting-ip": "203.0.113.7" });
    await expect(resolveLanding(afterDeletion, { fetch: vi.fn().mockResolvedValue(Response.json(null)) }))
      .resolves.toEqual({ state: "render" });
    await expect(requireUsernameReady(afterDeletion, { fetch: vi.fn().mockResolvedValue(Response.json(null)) }, "/home"))
      .resolves.toEqual({ state: "redirect", location: "/sign-in?next=%2Fhome" });
  });

  it("refreshes cookie mutations from the landing without treating the marker as auth", async () => {
    const response = Response.json({ user: {}, session: {} }, { headers: { "set-cookie": "session=renewed" } });
    await expect(resolveLanding(headers, { fetch: vi.fn().mockResolvedValue(response) }))
      .resolves.toEqual({ state: "redirect", location: "/auth/session-refresh?returnTo=%2F" });
    await expect(resolveLanding(new Headers({ "cf-connecting-ip": "203.0.113.7", cookie: "dayli_session_refresh_attempt=1" }), {
      fetch: vi.fn().mockResolvedValue(Response.json({ user: {}, session: {} }, { headers: { "set-cookie": "session=renewed" } })),
    })).resolves.toEqual({ state: "render" });
  });

  it("requires a validated session and username profile before allowing a route", async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce(Response.json({ user: { id: "user_1" }, session: { id: "session_1" } }))
      .mockResolvedValueOnce(Response.json({ needsUsernameSetup: false }));
    await expect(requireUsernameReady(headers, { fetch }, "/home")).resolves.toMatchObject({ state: "ready" });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("sends authenticated users without a username to setup", async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce(Response.json({ user: { id: "user_1" }, session: { id: "session_1" } }))
      .mockResolvedValueOnce(Response.json({ needsUsernameSetup: true }));
    await expect(requireUsernameReady(headers, { fetch }, "/home")).resolves.toEqual({ state: "needs-username" });
  });
});
