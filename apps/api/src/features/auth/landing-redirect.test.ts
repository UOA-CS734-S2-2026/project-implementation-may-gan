import { describe, expect, it, vi } from "vitest";
import { createApp } from "../../app";
import type { UsernameProfileStore } from "../profiles/username/username.repository";

const webOrigin = "https://web.example.test";

function appWith({
  resolveSession = async () => null,
  store,
  origin = webOrigin,
}: {
  resolveSession?: () => Promise<{ userId: string } | null>;
  store?: UsernameProfileStore;
  origin?: string;
} = {}) {
  return createApp({ landingRedirect: { resolveSession, store, webOrigin: origin } });
}

describe("landing redirect route", () => {
  it("returns an uncached public landing redirect when no API-origin session exists", async () => {
    const resolveSession = vi.fn(async () => null);
    const get = vi.fn();
    const response = await appWith({ resolveSession, store: { get, claimInitial: async () => "missing" } }).request("/api/auth/landing");

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(`${webOrigin}/?landing=signed-out`);
    expect(response.headers.get("cache-control")).toBe("no-store, private");
    expect(response.headers.get("vary")).toContain("Cookie");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
    expect(resolveSession).toHaveBeenCalledOnce();
    expect(get).not.toHaveBeenCalled();
  });

  it("redirects an authenticated account with a username before the web landing renders", async () => {
    const get = vi.fn(async () => ({ username: "dayli_user", publicName: "Dayli User", needsUsernameSetup: false }));
    const response = await appWith({
      resolveSession: async () => ({ userId: "account-1" }),
      store: { get, claimInitial: async () => "missing" },
    }).request("/api/auth/landing");

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(`${webOrigin}/home`);
    expect(get).toHaveBeenCalledWith("account-1");
  });

  it("redirects an authenticated account without a username to setup", async () => {
    const response = await appWith({
      resolveSession: async () => ({ userId: "account-1" }),
      store: {
        get: async () => ({ username: null, publicName: null, needsUsernameSetup: true }),
        claimInitial: async () => "missing",
      },
    }).request("/api/auth/landing");

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(`${webOrigin}/setup-username`);
  });

  it("fails closed without a valid configured web origin", async () => {
    const response = await appWith({
      resolveSession: async () => ({ userId: "account-1" }),
      store: { get: async () => null, claimInitial: async () => "missing" },
      origin: "https://web.example.test/not-an-origin",
    }).request("/api/auth/landing");

    expect(response.status).toBe(503);
    expect(response.headers.get("location")).toBeNull();
    expect(response.headers.get("cache-control")).toBe("no-store, private");
  });
});
