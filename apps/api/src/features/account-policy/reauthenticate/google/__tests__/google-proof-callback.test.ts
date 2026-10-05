import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from "jose";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { handleGoogleManagementCallback, isGoogleManagementCallback, type GoogleManagementCallbackDependencies } from "../google-proof-callback";
import { createGoogleManagementState } from "../google-proof.repository";
import { verifyGoogleManagementIdToken } from "../google-oidc";

const now = new Date();
const seconds = Math.floor(now.getTime() / 1_000);
const stateSecret = "test-only-google-state-secret-at-least-32-characters";
let state = "";
const nonce = "b".repeat(64);
const subject = "linked-google-subject";
let signingKey: Awaited<ReturnType<typeof generateKeyPair>>["privateKey"];
let keys: ReturnType<typeof createLocalJWKSet>;
let nonceDigest = "";

beforeAll(async () => {
  const pair = await generateKeyPair("RS256");
  signingKey = pair.privateKey;
  const jwk = await exportJWK(pair.publicKey);
  jwk.kid = "google-callback-test";
  keys = createLocalJWKSet({ keys: [jwk] });
  nonceDigest = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(nonce))),
    (byte) => byte.toString(16).padStart(2, "0")).join("");
  state = await createGoogleManagementState("https://web.example.test", stateSecret);
});

async function signedToken(overrides: { subject?: string; authTime?: number; nonce?: string } = {}) {
  return new SignJWT({ nonce: overrides.nonce ?? nonce, auth_time: overrides.authTime ?? seconds - 10, email_verified: true })
    .setProtectedHeader({ alg: "RS256", kid: "google-callback-test" })
    .setIssuer("https://accounts.google.com").setAudience("web-client-id")
    .setSubject(overrides.subject ?? subject).setIssuedAt(seconds - 5)
    .setExpirationTime(seconds + 240).sign(signingKey);
}

function deps(idToken: string, session: { userId: string; sessionId: string } | null = { userId: "owner", sessionId: "original-session" }): GoogleManagementCallbackDependencies {
  return {
    configuration: {
      clientId: "web-client-id", clientSecret: "test-only-google-client-secret-at-least-32-chars",
      redirectUri: "https://api.example.test/api/auth/callback/google",
      completionOrigin: "https://web.example.test",
      stateSecret,
    },
    trustedOrigins: ["https://api.example.test", "https://web.example.test"],
    resolveSession: vi.fn(async () => session),
    claim: vi.fn(async (input) => input.userId === "owner" && input.sessionId === "original-session" ? {
      stateDigest: "c".repeat(64), action: "request_deletion" as const, nonceDigest,
      createdAt: new Date(now.getTime() - 60_000), linkedSubject: subject,
    } : null),
    exchange: vi.fn(async () => ({ idToken, grantedScope: "openid email" })),
    verify: (input) => verifyGoogleManagementIdToken({ ...input, keys, now }),
    complete: vi.fn(async () => ({ token: "d".repeat(64), expiresAt: new Date(now.getTime() + 300_000) })),
  };
}

const callback = (stateValue = state, code = "one-use-code") => new Request(
  `https://api.example.test/api/auth/callback/google?state=${encodeURIComponent(stateValue)}&code=${encodeURIComponent(code)}`,
);

describe("isolated Google management callback", () => {
  it("exchanges and verifies the signed linked subject without invoking a login path", async () => {
    const configured = deps(await signedToken());
    expect(isGoogleManagementCallback(callback())).toBe(true);
    const result = await handleGoogleManagementCallback(callback(), configured);
    expect(result.status).toBe(200);
    expect(result.headers.get("cache-control")).toBe("no-store");
    expect(result.headers.get("referrer-policy")).toBe("no-referrer");
    expect(result.headers.get("content-type")).toContain("text/html");
    const body = await result.text();
    expect(body).toContain('type":"dayli.account-management-grant"');
    expect(body).toContain(`token":"${"d".repeat(64)}"`);
    expect(body).toContain('postMessage(grant,"https://web.example.test")');
    expect(body).not.toContain('postMessage(grant,"*")');
    expect(result.url).not.toContain("token=");
    expect(configured.claim).toHaveBeenCalledWith({ state, userId: "owner", sessionId: "original-session" });
    expect(configured.complete).toHaveBeenCalledWith({ userId: "owner", sessionId: "original-session", action: "request_deletion", stateDigest: "c".repeat(64), verifiedSubject: subject });
  });

  it("supports proxy mode when the callback and intent-bound opener share the web origin", async () => {
    const configured = deps(await signedToken());
    const result = await handleGoogleManagementCallback(new Request(
      `https://web.example.test/api/auth/callback/google?state=${encodeURIComponent(state)}&code=one-use-code`,
    ), configured);
    expect(result.status).toBe(200);
    expect(await result.text()).toContain('postMessage(grant,"https://web.example.test")');
  });

  it("rejects a state whose signed completion origin is not trusted", async () => {
    const configured = deps(await signedToken());
    const untrustedState = await createGoogleManagementState("https://attacker.test", stateSecret);
    expect((await handleGoogleManagementCallback(callback(untrustedState), configured)).status).toBe(400);
    expect(configured.claim).not.toHaveBeenCalled();
  });

  it("requires the original session and a claimable one-use state", async () => {
    const missing = deps(await signedToken(), null);
    expect((await handleGoogleManagementCallback(callback(), missing)).status).toBe(401);
    expect(missing.claim).not.toHaveBeenCalled();
    const wrongSession = deps(await signedToken(), { userId: "owner", sessionId: "other-session" });
    expect((await handleGoogleManagementCallback(callback(), wrongSession)).status).toBe(401);
    expect(wrongSession.complete).not.toHaveBeenCalled();
    const replay = deps(await signedToken());
    replay.claim = vi.fn(async () => null);
    expect((await handleGoogleManagementCallback(callback(), replay)).status).toBe(401);
    expect(replay.complete).not.toHaveBeenCalled();
  });

  it("never issues a grant for another Google subject or a stale authentication time", async () => {
    const swapped = deps(await signedToken({ subject: "another-google-account" }));
    expect((await handleGoogleManagementCallback(callback(), swapped)).status).toBe(401);
    expect(swapped.complete).not.toHaveBeenCalled();
    const stale = deps(await signedToken({ authTime: seconds - 400 }));
    expect((await handleGoogleManagementCallback(callback(), stale)).status).toBe(401);
    expect(stale.complete).not.toHaveBeenCalled();
  });

  it("does not treat a normal sign-in callback as a management proof", async () => {
    expect(isGoogleManagementCallback(callback("ordinary-better-auth-state"))).toBe(false);
    const configured = deps(await signedToken());
    expect((await handleGoogleManagementCallback(callback("bad-state"), configured)).status).toBe(400);
    const duplicateState = new Request(`${callback().url}&state=${encodeURIComponent(state)}`);
    expect((await handleGoogleManagementCallback(duplicateState, configured)).status).toBe(400);
    expect(configured.claim).not.toHaveBeenCalled();
  });
});
