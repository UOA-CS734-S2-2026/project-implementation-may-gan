import { describe, expect, it } from "vitest";
import { createApp } from "../../../app";
import { accountCapabilityForRequest } from "./account-policy.middleware";
import { allowsAccountCapability, resolveAccountPolicy } from "./account-policy";

const classify = (method: string, path: string) => accountCapabilityForRequest(new Request(`https://api.example.test${path}`, { method }));

describe("account policy", () => {
  it("keeps missing lifecycle rows active and draft Terms ineffective", () => {
    expect(resolveAccountPolicy(undefined).restriction).toBe("active");
    expect(resolveAccountPolicy({ termsRequired: false, ageDeclarationRequired: false }).restriction).toBe("active");
  });

  it("gives active bans priority and keeps purging ahead of underage and legal gates", () => {
    expect(resolveAccountPolicy({ banned: true, lifecycleState: "pending_deletion" }).restriction).toBe("banned");
    expect(resolveAccountPolicy({ lifecycleState: "purging", temporarilyRestricted: true }).restriction).toBe("purging");
    expect(resolveAccountPolicy({ lifecycleState: "purge_failed", termsRequired: true }).restriction).toBe("purge_failed");
    expect(resolveAccountPolicy({ lifecycleState: "pending_deletion", temporarilyRestricted: true }).restriction).toBe("underage_restricted");
  });

  it("keeps pending deletion limited to cancellation and restricted-state operations", () => {
    const policy = resolveAccountPolicy({ lifecycleState: "pending_deletion" });
    expect(allowsAccountCapability(policy, "ordinary")).toBe(false);
    expect(allowsAccountCapability(policy, "cancel_deletion_verification")).toBe(true);
    expect(allowsAccountCapability(policy, "export")).toBe(true);
  });

  it("uses exact reviewed route exceptions and defaults every other v1 route to ordinary", () => {
    expect(classify("GET", "/api/v1/health")).toBeUndefined();
    expect(classify("POST", "/api/v1/health")).toBe("ordinary");
    expect(classify("GET", "/api/v1/account/status")).toBe("policy_read");
    expect(classify("GET", "/api/v1/account/status/")).toBe("ordinary");
    expect(classify("POST", "/api/v1/account/policy")).toBe("ordinary");
    expect(classify("GET", "/api/v1/future-route")).toBe("ordinary");
  });

  it("denies restricted accounts before ordinary routes while allowing status without caching", async () => {
    const api = createApp({
      accountPolicy: {
        resolveSession: async () => ({ userId: "pending-user" }),
        policies: { resolve: async () => resolveAccountPolicy({ lifecycleState: "pending_deletion" }) },
      },
    });
    const denied = await api.request("https://api.example.test/api/v1/feed");
    expect(denied.status).toBe(403);
    await expect(denied.json()).resolves.toMatchObject({ error: { code: "FORBIDDEN", details: { restriction: "pending_deletion" } } });

    const status = await api.request("https://api.example.test/api/v1/account/status");
    expect(status.status).toBe(200);
    expect(status.headers.get("cache-control")).toBe("no-store");
    await expect(status.json()).resolves.toEqual({
      restriction: "pending_deletion",
      allowed: ["cancel_deletion_verification", "export", "lifecycle_status", "policy_read", "signout"],
    });
  });

  it("does not turn a policy lookup failure into a bypass", async () => {
    const api = createApp({
      accountPolicy: {
        resolveSession: async () => ({ userId: "user" }),
        policies: { resolve: async () => { throw new Error("database unavailable"); } },
      },
    });
    const response = await api.request("https://api.example.test/api/v1/future-route");
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({ error: { code: "SERVICE_UNAVAILABLE" } });
  });
});
