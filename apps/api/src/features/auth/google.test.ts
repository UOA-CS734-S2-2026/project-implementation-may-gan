import { createApp } from "../../app";
import { createBetterAuthCompatibilitySlice } from "./better-auth";
import { exportJWK, generateKeyPair, SignJWT } from "jose";
import { afterEach, describe, expect, it, vi } from "vitest";

const origin = "https://api.example.test";
const clientIds = ["web-client-id", "ios-client-id", "android-client-id"] as [string, string, string];
const secret = "test-only-better-auth-secret-that-is-at-least-32-characters";

async function signedGoogleToken(audience: string, subject = "migrated-google-subject") {
  const { privateKey, publicKey } = await generateKeyPair("RS256");
  const publicJwk = await exportJWK(publicKey);
  publicJwk.kid = "test-google-key";
  const token = await new SignJWT({
    email: "migrated@example.test",
    email_verified: true,
    name: "Migrated Google User",
    picture: "https://images.example.test/avatar.png",
  })
    .setProtectedHeader({ alg: "RS256", kid: "test-google-key" })
    .setIssuedAt()
    .setIssuer("https://accounts.google.com")
    .setAudience(audience)
    .setSubject(subject)
    .setExpirationTime("5m")
    .sign(privateKey);
  return { publicJwk, token };
}

function createGoogleApp() {
  return createApp({ auth: createBetterAuthCompatibilitySlice({
    baseURL: origin,
    secret,
    google: { clientIds, clientSecret: "worker-only-google-secret" },
    database: {
      user: [{
        id: "stable-imported-user-id",
        name: "Migrated Google User",
        email: "migrated@example.test",
        emailVerified: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      }],
      account: [{
        id: "stable-imported-google-account-id",
        accountId: "migrated-google-subject",
        providerId: "google",
        userId: "stable-imported-user-id",
        createdAt: new Date(),
        updatedAt: new Date(),
      }],
      session: [],
      verification: [],
    },
  }) });
}

function request(body: object) {
  return new Request(`${origin}/api/auth/sign-in/social`, {
    method: "POST",
    headers: { origin, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

afterEach(() => vi.unstubAllGlobals());

describe("Google Better Auth provider", () => {
  it("reuses a migrated Google subject and accepts configured native audiences", async () => {
    const { publicJwk, token } = await signedGoogleToken("ios-client-id");
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ keys: [publicJwk] }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const response = await createGoogleApp().fetch(request({
      provider: "google",
      idToken: { token },
    }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      redirect: false,
      user: { id: "stable-imported-user-id", email: "migrated@example.test" },
    });
    expect(response.headers.get("set-auth-token")).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("rejects Google ID tokens with an audience outside the explicit allow-list", async () => {
    const { publicJwk, token } = await signedGoogleToken("untrusted-client-id");
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ keys: [publicJwk] }), { status: 200 })));

    const response = await createGoogleApp().fetch(request({
      provider: "google",
      idToken: { token },
    }));

    expect(response.status).toBe(401);
    expect(response.headers.get("set-auth-token")).toBeNull();
  });
});
