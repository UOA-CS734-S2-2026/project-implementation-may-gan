import { createApp } from "../../app";
import { createBetterAuthCompatibilitySlice } from "./better-auth";
import { exportJWK, generateKeyPair, SignJWT } from "jose";
import { afterEach, describe, expect, it, vi } from "vitest";

const origin = "https://api.example.test";
const clientIds = ["web-client-id", "ios-client-id", "android-client-id"] as [string, string, string];
const secret = "test-only-better-auth-secret-that-is-at-least-32-characters";
const password = "not-a-real-password";

type CompatibilityDatabase = Parameters<typeof createBetterAuthCompatibilitySlice>[0]["database"];

async function signedGoogleToken(
  audience: string,
  subject = "migrated-google-subject",
  email = "migrated@example.test",
  emailVerified = true,
) {
  const { privateKey, publicKey } = await generateKeyPair("RS256");
  const publicJwk = await exportJWK(publicKey);
  publicJwk.kid = "test-google-key";
  const token = await new SignJWT({
    email,
    email_verified: emailVerified,
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

function createGoogleApp(database: CompatibilityDatabase = {
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
}) {
  return createApp({ auth: createBetterAuthCompatibilitySlice({
    baseURL: origin,
    secret,
    google: { clientIds, clientSecret: "worker-only-google-secret" },
    database,
  }) });
}

function request(path: string, body: object, headers: HeadersInit = { origin, "content-type": "application/json" }) {
  return new Request(`${origin}${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

async function signUpPasswordUser(app: ReturnType<typeof createGoogleApp>, email: string) {
  const response = await app.fetch(request("/api/auth/sign-up/email", {
    name: "Password User",
    email,
    password,
  }));
  expect(response.status).toBe(200);
  const token = response.headers.get("set-auth-token");
  expect(token).toBeTruthy();
  const body = await response.json() as { user: { id: string } };
  return { token: token!, userId: body.user.id };
}

function nativeHeaders(token: string): HeadersInit {
  return { "content-type": "application/json", authorization: `Bearer ${token}` };
}

function googleLinkBody(token: string, currentPassword = password) {
  return {
    provider: "google",
    password: currentPassword,
    idToken: { token },
  };
}

afterEach(() => vi.unstubAllGlobals());

describe("Google Better Auth provider", () => {
  it("reuses a migrated Google subject and accepts configured native audiences", async () => {
    const { publicJwk, token } = await signedGoogleToken("ios-client-id");
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ keys: [publicJwk] }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const response = await createGoogleApp().fetch(request("/api/auth/sign-in/social", {
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

    const response = await createGoogleApp().fetch(request("/api/auth/sign-in/social", {
      provider: "google",
      idToken: { token },
    }));

    expect(response.status).toBe(401);
    expect(response.headers.get("set-auth-token")).toBeNull();
  });

  it("rejects an unlinked Google subject that merely collides with a password email", async () => {
    const database: CompatibilityDatabase = {
      user: [{
        id: "password-user",
        name: "Password User",
        email: "collision@example.test",
        emailVerified: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      }],
      account: [],
      session: [],
      verification: [],
    };
    const { publicJwk, token } = await signedGoogleToken("android-client-id", "new-google-subject", "collision@example.test");
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ keys: [publicJwk] }), { status: 200 })));

    const response = await createGoogleApp(database).fetch(request("/api/auth/sign-in/social", {
      provider: "google",
      idToken: { token },
    }));

    expect(response.status).toBe(401);
    expect(database.account).toHaveLength(0);
  });

  it("links a matching verified Google identity only after the authenticated password holder confirms their password", async () => {
    const database: CompatibilityDatabase = { user: [], account: [], session: [], verification: [] };
    const app = createGoogleApp(database);
    const email = "link@example.test";
    const { token: nativeToken, userId } = await signUpPasswordUser(app, email);
    const { publicJwk, token } = await signedGoogleToken("android-client-id", "link-google-subject", email);
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ keys: [publicJwk] }), { status: 200 })));

    const linked = await app.fetch(request("/api/auth/link-social", googleLinkBody(token), nativeHeaders(nativeToken)));
    expect(linked.status).toBe(200);
    expect(database.account).toEqual(expect.arrayContaining([
      expect.objectContaining({ providerId: "google", accountId: "link-google-subject", userId }),
    ]));

    const signedIn = await app.fetch(request("/api/auth/sign-in/social", {
      provider: "google",
      idToken: { token },
    }));
    await expect(signedIn.json()).resolves.toMatchObject({ user: { id: userId, email } });
    expect(signedIn.headers.get("set-auth-token")).toBeTruthy();
  });

  it("rejects an unverified Google email even when it matches the password account", async () => {
    const app = createGoogleApp({ user: [], account: [], session: [], verification: [] });
    const { token: nativeToken } = await signUpPasswordUser(app, "unverified@example.test");
    const { publicJwk, token } = await signedGoogleToken(
      "android-client-id",
      "unverified-google-subject",
      "unverified@example.test",
      false,
    );
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ keys: [publicJwk] }), { status: 200 })));

    const response = await app.fetch(request("/api/auth/link-social", googleLinkBody(token), nativeHeaders(nativeToken)));
    expect(response.status).toBe(401);
  });

  it("requires the current password server-side for a native bearer link request", async () => {
    const app = createGoogleApp({ user: [], account: [], session: [], verification: [] });
    const { token: nativeToken } = await signUpPasswordUser(app, "password-check@example.test");
    const { publicJwk, token } = await signedGoogleToken("android-client-id", "password-check-subject", "password-check@example.test");
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ keys: [publicJwk] }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const missingPassword = await app.fetch(request("/api/auth/link-social", {
      provider: "google",
      idToken: { token },
    }, nativeHeaders(nativeToken)));
    const wrongPassword = await app.fetch(request("/api/auth/link-social", googleLinkBody(token, "wrong-password"), nativeHeaders(nativeToken)));

    expect(missingPassword.status).toBe(400);
    expect(wrongPassword.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects different emails and Google identities already linked to another user", async () => {
    const app = createGoogleApp({ user: [], account: [], session: [], verification: [] });
    const first = await signUpPasswordUser(app, "first@example.test");
    const second = await signUpPasswordUser(app, "second@example.test");
    const linkedGoogle = await signedGoogleToken("android-client-id", "shared-google-subject", "first@example.test");
    const otherGoogle = await signedGoogleToken("android-client-id", "other-google-subject", "other@example.test");
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ keys: [linkedGoogle.publicJwk, otherGoogle.publicJwk] }), { status: 200 })));

    expect((await app.fetch(request("/api/auth/link-social", googleLinkBody(linkedGoogle.token), nativeHeaders(first.token)))).status).toBe(200);
    expect((await app.fetch(request("/api/auth/link-social", googleLinkBody(otherGoogle.token), nativeHeaders(second.token)))).status).toBe(401);
    expect((await app.fetch(request("/api/auth/link-social", googleLinkBody(linkedGoogle.token), nativeHeaders(second.token)))).status).toBe(409);
  });
});
