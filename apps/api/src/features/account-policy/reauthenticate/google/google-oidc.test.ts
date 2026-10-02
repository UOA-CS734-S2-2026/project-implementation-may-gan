import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from "jose";
import { beforeAll, describe, expect, it } from "vitest";
import { verifyGoogleManagementIdToken } from "./google-oidc";

const now = new Date("2026-10-02T12:00:00.000Z");
const seconds = Math.floor(now.getTime() / 1_000);
const nonce = "dedicated-management-nonce-from-server-0123456789";
const subject = "linked-google-subject";
const clientId = "dedicated-web-oauth-client";
let privateKey: Awaited<ReturnType<typeof generateKeyPair>>["privateKey"];
let keys: ReturnType<typeof createLocalJWKSet>;
let nonceDigest = "";

beforeAll(async () => {
  const pair = await generateKeyPair("RS256");
  privateKey = pair.privateKey;
  const jwk = await exportJWK(pair.publicKey);
  jwk.kid = "google-test-key";
  keys = createLocalJWKSet({ keys: [jwk] });
  nonceDigest = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(nonce))),
    (byte) => byte.toString(16).padStart(2, "0")).join("");
});

type Overrides = {
  issuer?: string;
  audience?: string | string[];
  subject?: string;
  nonce?: unknown;
  authTime?: unknown;
  issuedAt?: number;
  expiresAt?: number;
  azp?: unknown;
  algorithm?: string;
  emailVerified?: boolean;
};

async function token(overrides: Overrides = {}) {
  const claims = {
    nonce: overrides.nonce === undefined ? nonce : overrides.nonce,
    email_verified: overrides.emailVerified ?? true,
    ...(overrides.authTime === null ? {} : { auth_time: overrides.authTime === undefined ? seconds - 20 : overrides.authTime }),
    ...(overrides.azp === undefined ? {} : { azp: overrides.azp }),
  };
  return new SignJWT(claims)
    .setProtectedHeader({ alg: overrides.algorithm ?? "RS256", kid: "google-test-key" })
    .setIssuer(overrides.issuer ?? "https://accounts.google.com")
    .setAudience(overrides.audience ?? clientId)
    .setSubject(overrides.subject ?? subject)
    .setIssuedAt(overrides.issuedAt ?? seconds - 15)
    .setExpirationTime(overrides.expiresAt ?? seconds + 240)
    .sign(privateKey);
}

function input(idToken: string) {
  return {
    idToken, grantedScope: "openid email", clientId, linkedSubject: subject,
    nonceDigest, intentCreatedAt: new Date(now.getTime() - 60_000), now, keys,
  };
}

describe("fresh Google OIDC management proof", () => {
  it("accepts a signed, audience-bound, linked-subject proof with fresh auth_time", async () => {
    await expect(verifyGoogleManagementIdToken(input(await token()))).resolves.toEqual({
      subject, authenticatedAt: new Date((seconds - 20) * 1_000),
    });
    await expect(verifyGoogleManagementIdToken(input(await token({ issuer: "accounts.google.com" })))).resolves.toMatchObject({ subject });
  });

  it("rejects an unrelated subject, nonce or client audience, including an incorrect azp", async () => {
    for (const modified of [
      { subject: "other-subject" }, { nonce: "another-management-nonce-from-server-0123456789" },
      { audience: "other-client" }, { azp: "other-client" },
      { audience: [clientId, "other-client"] },
      { audience: [clientId, "other-client"], azp: "other-client" },
      { issuer: "https://attacker.example.test" }, { emailVerified: false },
    ]) {
      await expect(verifyGoogleManagementIdToken(input(await token(modified)))).rejects.toThrow();
    }
  });

  it("rejects unsigned content, the wrong signing key, and a revoked scope", async () => {
    const signed = await token();
    const tampered = `${signed.slice(0, -3)}abc`;
    await expect(verifyGoogleManagementIdToken(input(tampered))).rejects.toThrow();
    const differentKeys = createLocalJWKSet({ keys: [{ ...(await exportJWK((await generateKeyPair("RS256")).publicKey)), kid: "google-test-key" }] });
    await expect(verifyGoogleManagementIdToken({ ...input(signed), keys: differentKeys })).rejects.toThrow();
    await expect(verifyGoogleManagementIdToken({ ...input(signed), grantedScope: "email profile" })).rejects.toThrow();
  });

  it("requires a signed fresh authentication time after this particular intent", async () => {
    for (const modified of [
      { authTime: null }, { authTime: "recent" }, { authTime: seconds - 360 },
      { authTime: seconds + 90 }, { authTime: seconds - 100 },
      { issuedAt: seconds - 390, authTime: seconds - 20 },
      { issuedAt: seconds - 390, authTime: seconds - 400 },
      { expiresAt: seconds - 90 },
    ]) {
      await expect(verifyGoogleManagementIdToken(input(await token(modified)))).rejects.toThrow();
    }
    await expect(verifyGoogleManagementIdToken({ ...input(await token()), intentCreatedAt: new Date(now.getTime() + 60_000) })).rejects.toThrow();
  });
});
