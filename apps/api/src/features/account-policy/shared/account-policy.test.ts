import { describe, expect, it } from "vitest";
import { createApp } from "../../../app";
import { accountCapabilityForPath } from "./account-policy.middleware";
import { allowsAccountCapability, resolveAccountPolicy } from "./account-policy";

describe("account policy", () => {
  it("treats a missing additive lifecycle record as active", () => {
    const policy = resolveAccountPolicy(undefined);
    expect(policy.restriction).toBe("active");
    expect(allowsAccountCapability(policy, "ordinary")).toBe(true);
  });

  it("does not gate a draft-only legal configuration", () => {
    const policy = resolveAccountPolicy({ termsRequired: false, ageDeclarationRequired: false });
    expect(policy.restriction).toBe("active");
  });

  it("keeps pending deletion limited to status, cancellation verification, export, policy reads, and signout", () => {
    const policy = resolveAccountPolicy({ lifecycleState: "pending_deletion" });
    expect(policy.restriction).toBe("pending_deletion");
    expect(allowsAccountCapability(policy, "ordinary")).toBe(false);
    expect(allowsAccountCapability(policy, "cancel_deletion_verification")).toBe(true);
    expect(allowsAccountCapability(policy, "export")).toBe(true);
  });

  it("gives purging precedence over all other restrictions", () => {
    const policy = resolveAccountPolicy({ lifecycleState: "purging", temporarilyRestricted: true });
    expect(policy.restriction).toBe("purging");
    expect(allowsAccountCapability(policy, "export")).toBe(false);
  });

  it("treats every new API path as ordinary unless it is explicitly public or restricted management", () => {
    expect(accountCapabilityForPath("/api/v1/health")).toBeUndefined();
    expect(accountCapabilityForPath("/api/v1/account/status")).toBe("policy_read");
    expect(accountCapabilityForPath("/api/v1/new-feature")).toBe("ordinary");
  });

  it("returns a machine-readable restricted response before ordinary feature routes", async () => {
    const api = createApp({
      accountPolicy: {
        resolveSession: async () => ({ userId: "pending-user" }),
        policies: { resolve: async () => resolveAccountPolicy({ lifecycleState: "pending_deletion" }) },
      },
    });
    const response = await api.request("https://api.example.test/api/v1/feed");
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({ error: { code: "FORBIDDEN", details: { restriction: "pending_deletion" } } });
  });

  it("allows a pending account to read its restricted status without exposing ordinary data", async () => {
    const api = createApp({
      accountPolicy: {
        resolveSession: async () => ({ userId: "pending-user" }),
        policies: { resolve: async () => resolveAccountPolicy({ lifecycleState: "pending_deletion" }) },
      },
    });
    const response = await api.request("https://api.example.test/api/v1/account/status");
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      restriction: "pending_deletion",
      allowed: ["cancel_deletion_verification", "export", "lifecycle_status", "policy_read", "signout"],
    });
  });
});
