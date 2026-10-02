import { describe, expect, it, vi } from "vitest";
import { createApp } from "../../../../app";
import { resolveAccountPolicy, type AccountPolicyState } from "../../shared/account-policy";
import type { GoogleManagementProofDependencies } from "./google-proof.route";

const url = "https://api.example.test/api/v1/account/reauthenticate/google";
const request = (action: string) => new Request(url, {
  method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action }),
});

function appFor(state?: Partial<AccountPolicyState>, begin: NonNullable<GoogleManagementProofDependencies["begin"]> = vi.fn(async () => ({
  url: "https://accounts.google.com/o/oauth2/v2/auth?state=safe", expiresAt: new Date("2026-10-02T12:00:00Z"),
})), limit: "allowed" | "denied" | "unavailable" = "allowed") {
  const resolveSession = async () => ({ userId: "owner", sessionId: "original-session" });
  return { api: createApp({
    accountPolicy: { resolveSession, policies: { resolve: async () => resolveAccountPolicy(state) } },
    googleManagementProof: { resolveSession, rateLimiter: { check: async () => limit }, begin },
  }), begin };
}

describe("session-bound Google management intent", () => {
  it("begins an active account action without issuing a deletion grant", async () => {
    const { api, begin } = appFor();
    const response = await api.request(request("request_deletion"));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual({ authorizationUrl: "https://accounts.google.com/o/oauth2/v2/auth?state=safe", expiresAt: "2026-10-02T12:00:00.000Z" });
    expect(begin).toHaveBeenCalledWith({ userId: "owner", sessionId: "original-session", action: "request_deletion" });
  });

  it("allows only cancellation verification while deletion is pending", async () => {
    const { api, begin } = appFor({ lifecycleState: "pending_deletion" });
    expect((await api.request(request("request_deletion"))).status).toBe(403);
    expect(begin).not.toHaveBeenCalled();
    expect((await api.request(request("cancel_deletion"))).status).toBe(200);
  });

  it("fails closed for a missing provider, invalid action, or exhausted limit", async () => {
    const absent = appFor(undefined, vi.fn(async () => null));
    expect((await absent.api.request(request("request_deletion"))).status).toBe(409);
    const invalid = appFor();
    expect((await invalid.api.request(request("wrong"))).status).toBe(422);
    expect(invalid.begin).not.toHaveBeenCalled();
    const limited = appFor(undefined, undefined, "denied");
    expect((await limited.api.request(request("request_deletion"))).status).toBe(429);
    expect(limited.begin).not.toHaveBeenCalled();
  });
});
