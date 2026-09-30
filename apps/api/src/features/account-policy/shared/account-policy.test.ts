import { describe, expect, it } from "vitest";
import { createApp } from "../../../app";
import { accountCapabilityForRequest } from "./account-policy.middleware";
import { allowsAccountCapability, allowsManagementGrantAction, resolveAccountPolicy } from "./account-policy";
import { accountManagementGrantLifetimeMs, resolveAccountManagementGrantExpiry } from "./account-management-grants";

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

  it("only permits lifecycle actions matching the current restriction", () => {
    const cases: Array<[Parameters<typeof allowsManagementGrantAction>[0], "request_deletion" | "cancel_deletion", boolean]> = [
      ["active", "request_deletion", true],
      ["active", "cancel_deletion", false],
      ["pending_deletion", "request_deletion", false],
      ["pending_deletion", "cancel_deletion", true],
      ["purging", "request_deletion", false],
      ["purging", "cancel_deletion", false],
      ["purge_failed", "request_deletion", false],
      ["purge_failed", "cancel_deletion", false],
    ];
    for (const [restriction, action, allowed] of cases) {
      expect(allowsManagementGrantAction(restriction, action)).toBe(allowed);
    }
  });

  it("derives an exact bounded ten-minute grant lifetime from a valid server instant", () => {
    const issuedAt = new Date("2026-10-01T00:00:00.000Z");
    expect(resolveAccountManagementGrantExpiry(issuedAt).getTime()).toBe(issuedAt.getTime() + accountManagementGrantLifetimeMs);
    expect(() => resolveAccountManagementGrantExpiry(new Date("invalid"))).toThrow(TypeError);
  });

  it("uses an exact method and path allowlist for public and management routes", () => {
    const classify = (method: string, path: string) => accountCapabilityForRequest(new Request(`https://api.example.test${path}`, { method }));
    expect(classify("GET", "/api/v1/health")).toBeUndefined();
    expect(classify("POST", "/api/v1/health")).toBe("ordinary");
    expect(classify("GET", "/api/v1/account/status")).toBe("policy_read");
    expect(classify("POST", "/api/v1/account/status")).toBe("ordinary");
    expect(classify("POST", "/api/v1/account/reauthenticate/password")).toBe("policy_read");
    expect(classify("GET", "/api/v1/account/reauthenticate/password")).toBe("ordinary");
    expect(classify("POST", "/api/v1/account/reauthenticate/password/extra")).toBe("ordinary");
    expect(classify("POST", "/api/v1/account/exports-preview")).toBe("ordinary");
    expect(classify("POST", "/api/v1/account/request-deletion-extra")).toBe("ordinary");
    expect(classify("GET", "/api/v1/account/status/")).toBe("ordinary");
    expect(classify("GET", "/api/v1/new-feature")).toBe("ordinary");
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

  it("issues a password-verified grant only for the current account and trusted origin", async () => {
    const api = createApp({
      accountPolicy: {
        resolveSession: async () => ({ userId: "pending-user" }),
        policies: { resolve: async () => resolveAccountPolicy({ lifecycleState: "pending_deletion" }) },
      },
      accountReauthentication: {
        trustedOrigins: ["https://app.example.test"],
        authorizeAction: async () => true,
        verifyPassword: async () => ({ userId: "pending-user", sessionId: "session-a" }),
        issueGrant: async () => ({ token: "opaque-grant", expiresAt: new Date("2026-10-01T00:00:00.000Z") }),
      },
    });
    const response = await api.request("https://api.example.test/api/v1/account/reauthenticate/password", {
      method: "POST",
      headers: { "content-type": "application/json", origin: "https://app.example.test" },
      body: JSON.stringify({ action: "cancel_deletion", password: "correct-password" }),
    });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ grant: "opaque-grant" });

    const attacker = await api.request("https://api.example.test/api/v1/account/reauthenticate/password", {
      method: "POST",
      headers: { "content-type": "application/json", origin: "https://attacker.example.test" },
      body: JSON.stringify({ action: "cancel_deletion", password: "correct-password" }),
    });
    expect(attacker.status).toBe(403);
  });

  it("does not invoke verification or issuance when policy rejects the requested action", async () => {
    const calls = { verify: 0, issue: 0 };
    const api = createApp({
      accountPolicy: {
        resolveSession: async () => ({ userId: "purging-user" }),
        policies: { resolve: async () => resolveAccountPolicy({ lifecycleState: "purging" }) },
      },
      accountReauthentication: {
        trustedOrigins: [],
        authorizeAction: async () => false,
        verifyPassword: async () => { calls.verify += 1; return { userId: "purging-user", sessionId: "session-a" }; },
        issueGrant: async () => { calls.issue += 1; return { token: "must-not-issue", expiresAt: new Date() }; },
      },
    });
    for (const action of ["request_deletion", "cancel_deletion"]) {
      const response = await api.request("https://api.example.test/api/v1/account/reauthenticate/password", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action, password: "correct-password" }),
      });
      expect(response.status).toBe(403);
    }
    expect(calls).toEqual({ verify: 0, issue: 0 });
  });

  it("rejects a verified credential for another account without revealing the mismatch", async () => {
    const api = createApp({
      accountPolicy: {
        resolveSession: async () => ({ userId: "pending-user" }),
        policies: { resolve: async () => resolveAccountPolicy({ lifecycleState: "pending_deletion" }) },
      },
      accountReauthentication: {
        trustedOrigins: [],
        authorizeAction: async () => true,
        verifyPassword: async () => ({ userId: "other-user", sessionId: "session-b" }),
        issueGrant: async () => ({ token: "must-not-issue", expiresAt: new Date() }),
      },
    });
    const response = await api.request("https://api.example.test/api/v1/account/reauthenticate/password", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "request_deletion", password: "correct-password" }),
    });
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({ error: { code: "FORBIDDEN" } });
  });
});
