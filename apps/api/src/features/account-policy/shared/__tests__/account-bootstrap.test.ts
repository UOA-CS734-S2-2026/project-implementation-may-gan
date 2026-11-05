import { describe, expect, it, vi } from "vitest";
import { createApp } from "../../../../app";
import { resolveAccountPolicy, type AccountPolicyState } from "../account-policy";

function setup(state: Partial<AccountPolicyState> = {}, needsUsernameSetup = false) {
  const resolveSession = vi.fn(async () => ({ userId: "owner", sessionId: "session" }));
  const resolve = vi.fn(async () => resolveAccountPolicy(state));
  const get = vi.fn(async () => ({ username: needsUsernameSetup ? null : "anton", publicName: null, needsUsernameSetup }));
  const app = createApp({ accountPolicy: { resolveSession, policies: { resolve }, usernameStore: { get } } });
  return { app, resolveSession, resolve, get };
}

describe("account access bootstrap", () => {
  it("returns minimal onboarding state with one session and policy resolution", async () => {
    const { app, resolveSession, resolve, get } = setup({}, true);
    const response = await app.request("/api/v1/account/bootstrap");
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toMatchObject({
      restriction: "active", allowed: expect.arrayContaining(["ordinary"]),
      onboarding: { legalAcceptanceRequired: false, usernameSetupRequired: true },
    });
    expect(resolveSession).toHaveBeenCalledTimes(1);
    expect(resolve).toHaveBeenCalledTimes(1);
    expect(get).toHaveBeenCalledWith("owner");
  });

  it.each([
    { termsRequired: true },
    { ageDeclarationRequired: true },
    { lifecycleState: "pending_deletion" as const },
    { lifecycleState: "purging" as const },
    { banned: true },
  ])("allows restricted owners to discover recovery state: %j", async (state) => {
    const { app } = setup(state);
    const response = await app.request("/api/v1/account/bootstrap");
    expect(response.status).toBe(200);
    const body = await response.json() as { restriction: string; allowed: string[] };
    expect(body.restriction).not.toBe("active");
    expect(body.allowed).not.toContain("ordinary");
    // The new read exception does not grant ordinary access.
    expect((await app.request("/api/v1/profile/username")).status).toBe(403);
  });

  it.each(["status", "policy"])("reuses middleware policy for account/%s", async (path) => {
    const { app, resolve } = setup();
    expect((await app.request(`/api/v1/account/${path}`)).status).toBe(200);
    expect(resolve).toHaveBeenCalledTimes(1);
  });

  it("does not expose another owner's profile or permit anonymous access", async () => {
    const app = createApp({ accountPolicy: {
      resolveSession: async () => null,
      policies: { resolve: async () => resolveAccountPolicy(undefined) },
      usernameStore: { get: vi.fn() },
    } });
    expect((await app.request("/api/v1/account/bootstrap?userId=someone-else")).status).toBe(401);
  });

  it("fails closed on policy or profile outages", async () => {
    const { app, get } = setup();
    get.mockRejectedValueOnce(new Error("private database details"));
    const response = await app.request("/api/v1/account/bootstrap");
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("database details");
  });
});
