import { describe, expect, it, vi } from "vitest";
import { createApp } from "../../../../app";
import { resolveAccountPolicy, type AccountPolicyState } from "../../shared/account-policy";
import type { PasswordReauthenticationDependencies } from "./password.route";

const url = "https://api.example.test/api/v1/account/reauthenticate/password";
const actor = { userId: "owner", sessionId: "live-session" };
const request = (action: string, password = "secret") => new Request(url, {
  method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action, password }),
});

function appFor(state?: Partial<AccountPolicyState>, issue: NonNullable<PasswordReauthenticationDependencies["issue"]> = vi.fn(async () => ({ status: "issued" as const, token: "a".repeat(64), expiresAt: new Date("2026-10-02T09:00:00Z") })),
  limit: "allowed" | "denied" | "unavailable" = "allowed") {
  const resolveSession = async () => actor;
  return { api: createApp({
    accountPolicy: { resolveSession, policies: { resolve: async () => resolveAccountPolicy(state) } },
    passwordReauthentication: { resolveSession, rateLimiter: { check: async () => limit }, issue },
  }), issue };
}

describe("action-bound password reauthentication", () => {
  it("issues one opaque grant for an active account without returning password material", async () => {
    const { api, issue } = appFor();
    const response = await api.request(request("request_deletion"));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual({ action: "request_deletion", token: "a".repeat(64), expiresAt: "2026-10-02T09:00:00.000Z" });
    expect(issue).toHaveBeenCalledWith({ userId: actor.userId, sessionId: actor.sessionId, action: "request_deletion", password: "secret" });
  });

  it("allows only cancellation verification while deletion is pending", async () => {
    const { api, issue } = appFor({ lifecycleState: "pending_deletion" });
    expect((await api.request(request("request_deletion"))).status).toBe(403);
    expect(issue).not.toHaveBeenCalled();
    expect((await api.request(request("cancel_deletion"))).status).toBe(200);
  });

  it("never grants an invalid password, a Google-only account, or an exhausted actor limit", async () => {
    const invalid = appFor(undefined, vi.fn(async () => ({ status: "invalid_password" as const })));
    expect((await invalid.api.request(request("request_deletion"))).status).toBe(401);
    const googleOnly = appFor(undefined, vi.fn(async () => ({ status: "password_unavailable" as const })));
    const response = await googleOnly.api.request(request("request_deletion"));
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({ error: { details: { proof: "google_required" } } });
    const limited = appFor(undefined, undefined, "denied");
    expect((await limited.api.request(request("request_deletion"))).status).toBe(429);
    expect(limited.issue).not.toHaveBeenCalled();
  });

  it("rejects missing session binding and malformed actions before a grant can be issued", async () => {
    const issue = vi.fn();
    const api = createApp({ passwordReauthentication: {
      resolveSession: async () => ({ userId: "owner" }), rateLimiter: { check: async () => "allowed" }, issue,
    } });
    expect((await api.request(request("request_deletion"))).status).toBe(401);
    const active = appFor();
    expect((await active.api.request(request("unknown"))).status).toBe(422);
    expect(active.issue).not.toHaveBeenCalled();
    expect(issue).not.toHaveBeenCalled();
  });
});
