import { describe, expect, it, vi } from "vitest";
import { createApp } from "../../../app";
import { resolveAccountPolicy } from "../shared/account-policy";
import type { GoogleProofRouteDependencies } from "./google-proof.route";

const oauth = {
  clientId: "google-proof-client",
  clientSecret: "server-only-secret",
  callbackUrl: "https://api.example.test/api/v1/account/reauthenticate/google/callback",
  completionUrl: "https://app.example.test/account/google-proof-complete",
  encryption: { version: "enc-v1", material: "MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY" },
  subjectHmac: { version: "sub-v1", material: "YWJjZGVmMDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODk" },
};

function dependencies(overrides: Partial<GoogleProofRouteDependencies> = {}): GoogleProofRouteDependencies {
  return {
    trustedOrigins: ["https://app.example.test"],
    oauth,
    authorizeAction: async () => true,
    resolveSession: async () => ({ userId: "user", sessionId: "session" }),
    lifecycleGeneration: async () => 0,
    intents: {
      create: async () => true,
      claim: async () => null,
      recordVerifiedProof: async () => true,
      complete: async () => ({ token: "opaque-grant", expiresAt: new Date("2026-10-01T00:00:00.000Z") }),
      fail: async () => true,
    },
    verifyIdToken: async () => ({ subject: "google-subject" }),
    ...overrides,
  };
}

function app(googleProof: GoogleProofRouteDependencies) {
  return createApp({
    accountPolicy: {
      resolveSession: async () => ({ userId: "user" }),
      policies: { resolve: async () => resolveAccountPolicy({ lifecycleState: "active" }) },
    },
    googleProof,
  });
}

describe("Google proof routes", () => {
  it("begins only for the original actor and returns a server-built authorization URL", async () => {
    const create = vi.fn(async () => true);
    const response = await app(dependencies({ intents: { ...dependencies().intents, create } })).request("https://api.example.test/api/v1/account/reauthenticate/google/begin", {
      method: "POST", headers: { "content-type": "application/json", origin: "https://app.example.test" }, body: JSON.stringify({ action: "request_deletion" }),
    });
    expect(response.status).toBe(200);
    const body = await response.json() as { authorizationUrl: string };
    const authorization = new URL(body.authorizationUrl);
    expect(authorization.origin).toBe("https://accounts.google.com");
    expect(authorization.searchParams.get("redirect_uri")).toBe(oauth.callbackUrl);
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ action: "request_deletion", session: { userId: "user", sessionId: "session" }, verifierKeyVersion: "enc-v1" }));
    expect(response.headers.get("cache-control")).toContain("no-store");
  });

  it("rejects untrusted browser origins before creating a continuation", async () => {
    const create = vi.fn(async () => true);
    const response = await app(dependencies({ intents: { ...dependencies().intents, create } })).request("https://api.example.test/api/v1/account/reauthenticate/google/begin", {
      method: "POST", headers: { "content-type": "application/json", origin: "https://attacker.example.test" }, body: JSON.stringify({ action: "request_deletion" }),
    });
    expect(response.status).toBe(403);
    expect(create).not.toHaveBeenCalled();
  });

  it("keeps callback public but claim-fenced and redirects only to the fixed completion URL", async () => {
    const fail = vi.fn(async () => true);
    const response = await app(dependencies({ intents: { ...dependencies().intents, claim: async () => ({ claimToken: "c".repeat(43), verifierCiphertext: "invalid", verifierKeyVersion: "enc-v1", userId: "user", sessionId: "session", action: "request_deletion", lifecycleGeneration: 0, nonceDigest: "a".repeat(64) }), fail } })).request(`https://api.example.test/api/v1/account/reauthenticate/google/callback?state=${"s".repeat(43)}`);
    expect(response.status).toBe(303);
    expect(new URL(response.headers.get("location")!).origin + new URL(response.headers.get("location")!).pathname).toBe("https://app.example.test/account/google-proof-complete");
    expect(new URL(response.headers.get("location")!).searchParams.get("outcome")).toBe("failed");
    expect(fail).toHaveBeenCalled();
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
  });

  it("requires the original session and action to complete and returns only an opaque grant", async () => {
    const complete = vi.fn(async () => ({ token: "opaque-grant", expiresAt: new Date("2026-10-01T00:00:00.000Z") }));
    const response = await app(dependencies({ intents: { ...dependencies().intents, complete } })).request("https://api.example.test/api/v1/account/reauthenticate/google/complete", {
      method: "POST", headers: { "content-type": "application/json", origin: "https://app.example.test" }, body: JSON.stringify({ action: "request_deletion", state: "s".repeat(43) }),
    });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ grant: "opaque-grant", expiresAt: "2026-10-01T00:00:00.000Z" });
    expect(complete).toHaveBeenCalledWith(expect.any(String), { userId: "user", sessionId: "session" }, "request_deletion");
  });
});
