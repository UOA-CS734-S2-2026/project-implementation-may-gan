import { createDayliDatabase } from "@dayli/db";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { exportJWK, generateKeyPair, SignJWT } from "jose";
import { createApp, createAppForEnv } from "../../app";
import { registerPostgresBetterAuthRoutes, type SessionRevocationHook } from "./route";

const migratorUrl = process.env.TEST_DATABASE_URL;
const appUrl = process.env.TEST_APP_DATABASE_URL;
const hasTestDatabaseConfig = Boolean(migratorUrl && appUrl);
const testPostgresPort = process.env.VERIFY_POSTGRES_PORT ?? "5433";
const origin = "https://api.example.test";
const trustedOrigins = "https://api.example.test,https://web.example.test";
const secret = "test-only-better-auth-secret-that-is-at-least-32-characters";

function requireLocalTestUrl(value: string | undefined, name: string): string {
  if (!value) throw new Error(`${name} is required for PostgreSQL auth integration tests.`);
  const url = new URL(value);
  if (url.hostname !== "localhost" || url.port !== testPostgresPort || url.pathname !== "/dayli_test") {
    throw new Error(`${name} must target localhost:${testPostgresPort}/dayli_test.`);
  }
  return value;
}

function productionAuthEnvironment() {
  return {
    HYPERDRIVE: { connectionString: requireLocalTestUrl(appUrl, "TEST_APP_DATABASE_URL") },
    BETTER_AUTH_SECRET: secret,
    BETTER_AUTH_BASE_URL: origin,
    BETTER_AUTH_TRUSTED_ORIGINS: trustedOrigins,
  };
}

function createProductionApp() {
  return createAppForEnv(productionAuthEnvironment());
}

function createProductionGoogleApp() {
  return createAppForEnv({
    ...productionAuthEnvironment(),
    GOOGLE_WEB_CLIENT_ID: "web-client-id",
    GOOGLE_IOS_CLIENT_ID: "ios-client-id",
    GOOGLE_ANDROID_CLIENT_ID: "android-client-id",
    GOOGLE_CLIENT_SECRET: "test-google-client-secret",
  });
}

async function signedGoogleToken(audience: string, subject: string, email: string) {
  const { privateKey, publicKey } = await generateKeyPair("RS256");
  const publicJwk = await exportJWK(publicKey);
  publicJwk.kid = "postgres-registration-google-key";
  const token = await new SignJWT({
    email,
    email_verified: true,
    name: "PostgreSQL Google User",
    picture: "https://images.example.test/google-avatar.png",
  })
    .setProtectedHeader({ alg: "RS256", kid: publicJwk.kid })
    .setIssuedAt()
    .setIssuer("https://accounts.google.com")
    .setAudience(audience)
    .setSubject(subject)
    .setExpirationTime("5m")
    .sign(privateKey);
  return { publicJwk, token };
}

function createProductionAuthApp(revocations: SessionRevocationHook) {
  const api = createApp();
  if (!registerPostgresBetterAuthRoutes(api, productionAuthEnvironment(), revocations)) {
    throw new Error("Test Better Auth configuration is invalid.");
  }
  return api;
}

function request(path: string, init: RequestInit = {}, requestOrigin = origin) {
  const headers = new Headers(init.headers);
  headers.set("origin", requestOrigin);
  return new Request(`${origin}${path}`, { ...init, headers });
}

function nativeToken(response: Response) {
  const token = response.headers.get("set-auth-token");
  expect(token).toBeTruthy();
  return token!;
}

function signUpRequest(email: string, extraHeaders: HeadersInit = {}) {
  return request("/api/auth/sign-up/email", {
    method: "POST",
    headers: { "content-type": "application/json", ...extraHeaders },
    body: JSON.stringify({ name: "PostgreSQL User", username: `postgres_${email.replace(/[^a-z0-9]/gi, "_").toLowerCase()}`.slice(0, 30), email, password: "not-a-real-password" }),
  });
}

async function signUp(app: ReturnType<typeof createProductionApp>, email = "postgres@example.test") {
  return app.fetch(signUpRequest(email));
}

async function signIn(app: ReturnType<typeof createProductionApp>) {
  return app.fetch(request("/api/auth/sign-in/email", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "postgres@example.test", password: "not-a-real-password" }),
  }));
}

(hasTestDatabaseConfig ? describe : describe.skip)("Better Auth PostgreSQL persistence", () => {
  const migrator = createDayliDatabase(requireLocalTestUrl(
    migratorUrl ?? "postgresql://migrator:migrator@localhost:5433/dayli_test",
    "TEST_DATABASE_URL",
  ));

  beforeEach(async () => {
    vi.unstubAllGlobals();
    await migrator.client.unsafe('truncate table public."rateLimit", public.account, public.session, public.verification, public."user", public.registration_intents, public.legal_document_versions cascade');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  afterAll(async () => {
    await migrator.close();
  });

  it("creates empty session and verification target tables", async () => {
    const [row] = await migrator.client`
      select
        (select count(*)::int from public.session) as sessions,
        (select count(*)::int from public.verification) as verifications
    `;
    expect(row).toMatchObject({ sessions: 0, verifications: 0 });
  });

  it("preserves stable text IDs, profile fields, and account record shape", async () => {
    await migrator.client`
      insert into public."user" (id, name, username, display_username, bio, mbti, what_i_do, listening_to, profile_visibility, email, tier, role, banned)
      values ('schema-user-id', 'Schema User', 'schema_user', 'Schema', 'Bio', 'INTJ', 'Student', 'Music', 'private', 'schema@example.test', 'pro', 'user', false)
    `;
    await migrator.client`
      insert into public.account (id, account_id, provider_id, user_id, password)
      values ('schema-account-id', 'schema-account', 'credential', 'schema-user-id', 'test-password')
    `;

    const [row] = await migrator.client`
      select u.id, u.username, u.profile_visibility, u.tier, a.user_id, a.provider_id
      from public."user" u join public.account a on a.user_id = u.id
      where u.id = 'schema-user-id'
    `;
    expect(row).toMatchObject({
      id: "schema-user-id",
      username: "schema_user",
      profile_visibility: "private",
      tier: "pro",
      user_id: "schema-user-id",
      provider_id: "credential",
    });
  });

  it("registers, signs in, persists across app instances, expires, logs out, and revokes sessions", async () => {
    const firstApp = createProductionApp();
    const signUpResponse = await signUp(firstApp);
    const firstToken = nativeToken(signUpResponse);
    expect(signUpResponse.status).toBe(200);
    expect(signUpResponse.headers.get("set-cookie")).toContain("Secure");
    expect(signUpResponse.headers.get("access-control-expose-headers")).toContain("set-auth-token");

    const secondApp = createProductionApp();
    const persisted = await secondApp.fetch(request("/api/auth/get-session", {
      headers: { authorization: `Bearer ${firstToken}` },
    }));
    await expect(persisted.json()).resolves.toMatchObject({ user: { email: "postgres@example.test" } });

    const secondToken = nativeToken(await signIn(secondApp));
    const revoke = await firstApp.fetch(request("/api/auth/revoke-sessions", {
      method: "POST",
      headers: { authorization: `Bearer ${secondToken}` },
    }));
    expect(revoke.status).toBe(200);
    const revoked = await secondApp.fetch(request("/api/auth/get-session", {
      headers: { authorization: `Bearer ${firstToken}` },
    }));
    await expect(revoked.json()).resolves.toBeNull();

    const logoutToken = nativeToken(await signIn(firstApp));
    const logout = await secondApp.fetch(request("/api/auth/sign-out", {
      method: "POST",
      headers: { authorization: `Bearer ${logoutToken}` },
    }));
    expect(logout.status).toBe(200);
    const loggedOut = await firstApp.fetch(request("/api/auth/get-session", {
      headers: { authorization: `Bearer ${logoutToken}` },
    }));
    await expect(loggedOut.json()).resolves.toBeNull();

    const expiryToken = nativeToken(await signIn(firstApp));
    await migrator.client`update public.session set expires_at = now() - interval '1 second'`;
    const expired = await secondApp.fetch(request("/api/auth/get-session", {
      headers: { authorization: `Bearer ${expiryToken}` },
    }));
    await expect(expired.json()).resolves.toBeNull();
  });

  it("issues password management grants only for current real Better Auth cookie and bearer sessions", async () => {
    const app = createProductionApp();
    const signedUp = await signUp(app, "reauth@example.test");
    const bearer = nativeToken(signedUp);
    const cookie = signedUp.headers.get("set-cookie")?.split(";", 1)[0];
    expect(cookie).toBeTruthy();

    const browserGrant = await app.fetch(request("/api/v1/account/reauthenticate/password", {
      method: "POST",
      headers: { "content-type": "application/json", cookie: cookie! },
      body: JSON.stringify({ action: "request_deletion", password: "not-a-real-password" }),
    }));
    expect(browserGrant.status).toBe(200);
    await expect(browserGrant.json()).resolves.toMatchObject({ grant: expect.any(String) });
    expect(browserGrant.headers.get("cache-control")).toContain("no-store");

    const nativeGrant = await app.fetch(new Request(`${origin}/api/v1/account/reauthenticate/password`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${bearer}` },
      body: JSON.stringify({ action: "request_deletion", password: "not-a-real-password" }),
    }));
    expect(nativeGrant.status).toBe(200);

    const wrongPassword = await app.fetch(request("/api/v1/account/reauthenticate/password", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${bearer}` },
      body: JSON.stringify({ action: "request_deletion", password: "wrong-password" }),
    }));
    expect(wrongPassword.status).toBe(403);

    const maliciousOrigin = await app.fetch(request("/api/v1/account/reauthenticate/password", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${bearer}` },
      body: JSON.stringify({ action: "request_deletion", password: "not-a-real-password" }),
    }, "https://attacker.example.test"));
    expect(maliciousOrigin.status).toBe(403);

    const revoke = await app.fetch(request("/api/auth/revoke-sessions", {
      method: "POST",
      headers: { authorization: `Bearer ${bearer}` },
    }));
    expect(revoke.status).toBe(200);
    const revoked = await app.fetch(new Request(`${origin}/api/v1/account/reauthenticate/password`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${bearer}` },
      body: JSON.stringify({ action: "request_deletion", password: "not-a-real-password" }),
    }));
    expect(revoked.status).toBe(401);

    const renewed = nativeToken(await app.fetch(request("/api/auth/sign-in/email", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "reauth@example.test", password: "not-a-real-password" }),
    })));
    await migrator.client`update public.session set expires_at = now() - interval '1 second'`;
    const expired = await app.fetch(new Request(`${origin}/api/v1/account/reauthenticate/password`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${renewed}` },
      body: JSON.stringify({ action: "request_deletion", password: "not-a-real-password" }),
    }));
    expect(expired.status).toBe(401);
  });

  it("requires a single-use server Terms and age intent before creating a password account", async () => {
    const documentId = `terms-${crypto.randomUUID()}`;
    const canonicalContent = "# Test Terms\n\nCanonical test content.";
    const digest = [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonicalContent)))]
      .map((byte) => byte.toString(16).padStart(2, "0")).join("");
    const databaseSchema = (await import("@dayli/db")).schema;
    await migrator.db.insert(databaseSchema.legalDocumentVersions).values({
      id: documentId,
      kind: "terms",
      version: Math.floor(Math.random() * 1_000_000_000) + 1,
      contentDigest: digest,
      status: "effective",
      effectiveAt: new Date(Date.now() - 1_000),
    });
    await migrator.db.insert(databaseSchema.legalDocumentContents).values({ termsVersionId: documentId, canonicalContent });
    const app = createProductionApp();
    const issued = await app.fetch(request("/api/v1/legal/registration-intents", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ flow: "email", acceptTerms: true, declareAge16OrOlder: true }),
    }));
    expect(issued.status).toBe(201);
    const proof = await issued.json() as { intent: string; flowBinding: string; terms: { id: string; contentDigest: string } };
    expect(proof.terms).toMatchObject({ id: documentId, contentDigest: digest });

    const rejected = await app.fetch(signUpRequest("missing-intent@example.test"));
    expect(rejected.status).toBe(403);

    const competing = ["first-intent@example.test", "second-intent@example.test"].map((email) => app.fetch(signUpRequest(email, {
      "x-dayli-registration-intent": proof.intent,
      "x-dayli-registration-binding": proof.flowBinding,
    })));
    const results = await Promise.all(competing);
    expect(results.filter((response) => response.status === 200)).toHaveLength(1);
    const [accepted] = results.filter((response) => response.status === 200);
    const body = await accepted!.json() as { user: { id: string } };
    const [termsAcceptance] = await migrator.client`select accepted_at from public.terms_acceptances where user_id = ${body.user.id} and terms_version_id = ${documentId}`;
    const [ageDeclaration] = await migrator.client`select declaration_version from public.age_declarations where user_id = ${body.user.id}`;
    const [account] = await migrator.client`select provider_id from public.account where user_id = ${body.user.id}`;
    const [session] = await migrator.client`select id from public.session where user_id = ${body.user.id}`;
    expect(termsAcceptance?.accepted_at).toBeTruthy();
    expect(ageDeclaration).toEqual({ declaration_version: "age-16-v1" });
    expect(account).toEqual({ provider_id: "credential" });
    expect(session?.id).toBeTruthy();
  });

  it("admits a real Better Auth native Google user only through a current single-use intent", async () => {
    const canonicalContent = "# Native Google Terms\n\nCanonical test content.";
    const digest = [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonicalContent)))]
      .map((byte) => byte.toString(16).padStart(2, "0")).join("");
    const documentId = `google-terms-${crypto.randomUUID()}`;
    const databaseSchema = (await import("@dayli/db")).schema;
    await migrator.db.insert(databaseSchema.legalDocumentVersions).values({
      id: documentId, kind: "terms", version: Math.floor(Math.random() * 1_000_000_000) + 1,
      contentDigest: digest, status: "effective", effectiveAt: new Date(Date.now() - 1_000),
    });
    await migrator.db.insert(databaseSchema.legalDocumentContents).values({ termsVersionId: documentId, canonicalContent });
    const app = createProductionGoogleApp();
    const issued = await app.fetch(request("/api/v1/legal/registration-intents", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ flow: "google_native", acceptTerms: true, declareAge16OrOlder: true }),
    }));
    expect(issued.status).toBe(201);
    const proof = await issued.json() as { intent: string; flowBinding: string };
    const { publicJwk, token } = await signedGoogleToken("ios-client-id", `native-${crypto.randomUUID()}`, "native-registration@example.test");
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ keys: [publicJwk] }), { status: 200 })));

    const missing = await app.fetch(request("/api/auth/sign-in/social", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ provider: "google", idToken: { token } }),
    }));
    expect(missing.status).toBe(401);
    const [missingCount] = await migrator.client`select count(*)::int as count from public."user" where email = 'native-registration@example.test'`;
    expect(missingCount?.count).toBe(0);
    const forged = await app.fetch(request("/api/auth/sign-in/social", {
      method: "POST",
      headers: { "content-type": "application/json", "x-dayli-registration-intent": proof.intent, "x-dayli-registration-binding": "0".repeat(64) },
      body: JSON.stringify({ provider: "google", idToken: { token } }),
    }));
    expect(forged.status).toBe(401);
    const [forgedCount] = await migrator.client`select count(*)::int as count from public."user" where email = 'native-registration@example.test'`;
    expect(forgedCount?.count).toBe(0);

    const admitted = await app.fetch(request("/api/auth/sign-in/social", {
      method: "POST",
      headers: { "content-type": "application/json", "x-dayli-registration-intent": proof.intent, "x-dayli-registration-binding": proof.flowBinding },
      body: JSON.stringify({ provider: "google", idToken: { token } }),
    }));
    expect(admitted.status).toBe(200);
    const body = await admitted.json() as { user: { id: string } };
    expect(body.user as Record<string, unknown>).not.toHaveProperty("legal_registration_admission");
    expect(admitted.headers.get("set-auth-token")).toBeTruthy();
    const [row] = await migrator.client`select u.legal_registration_admission, a.provider_id, s.id as session_id, ta.terms_version_id, ad.declaration_version from public."user" u join public.account a on a.user_id = u.id join public.session s on s.user_id = u.id join public.terms_acceptances ta on ta.user_id = u.id join public.age_declarations ad on ad.user_id = u.id where u.id = ${body.user.id}`;
    expect(row?.legal_registration_admission).toBeNull();
    expect(row).toMatchObject({ provider_id: "google", terms_version_id: documentId, declaration_version: "age-16-v1" });
    expect(row?.session_id).toBeTruthy();

    const replay = await app.fetch(request("/api/auth/sign-in/social", {
      method: "POST",
      headers: { "content-type": "application/json", "cf-connecting-ip": "198.51.100.20", "x-dayli-registration-intent": proof.intent, "x-dayli-registration-binding": proof.flowBinding },
      body: JSON.stringify({ provider: "google", idToken: { token } }),
    }));
    expect(replay.status).toBe(200);
    const [count] = await migrator.client`select count(*)::int as count from public."user" where email = 'native-registration@example.test'`;
    expect(count?.count).toBe(1);
  });

  it("admits a real Better Auth browser Google callback only through its bound state", async () => {
    const canonicalContent = "# Browser Google Terms\n\nCanonical test content.";
    const digest = [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonicalContent)))]
      .map((byte) => byte.toString(16).padStart(2, "0")).join("");
    const documentId = `browser-google-terms-${crypto.randomUUID()}`;
    const databaseSchema = (await import("@dayli/db")).schema;
    await migrator.db.insert(databaseSchema.legalDocumentVersions).values({
      id: documentId, kind: "terms", version: Math.floor(Math.random() * 1_000_000_000) + 1,
      contentDigest: digest, status: "effective", effectiveAt: new Date(Date.now() - 1_000),
    });
    await migrator.db.insert(databaseSchema.legalDocumentContents).values({ termsVersionId: documentId, canonicalContent });
    const app = createProductionGoogleApp();
    const issued = await app.fetch(request("/api/v1/legal/registration-intents", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ flow: "google_browser", acceptTerms: true, declareAge16OrOlder: true }),
    }));
    expect(issued.status).toBe(201);
    const proof = await issued.json() as { intent: string; flowBinding: string };
    const { publicJwk, token } = await signedGoogleToken("web-client-id", `browser-${crypto.randomUUID()}`, "browser-registration@example.test");
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      access_token: "test-browser-access-token", token_type: "Bearer", expires_in: 300, id_token: token, keys: [publicJwk],
    }), { status: 200, headers: { "content-type": "application/json" } })));

    const started = await app.fetch(request("/api/auth/sign-in/social", {
      method: "POST",
      headers: { "content-type": "application/json", "x-dayli-registration-intent": proof.intent, "x-dayli-registration-binding": proof.flowBinding },
      body: JSON.stringify({ provider: "google", callbackURL: `${origin}/welcome`, disableRedirect: true }),
    }));
    expect(started.status).toBe(200);
    const authorization = await started.json() as { url: string };
    const state = new URL(authorization.url).searchParams.get("state");
    expect(state).toBeTruthy();
    const cookie = started.headers.get("set-cookie");
    expect(cookie).toBeTruthy();

    const callback = await app.fetch(new Request(`${origin}/api/auth/callback/google?state=${encodeURIComponent(state!)}&code=test-browser-code`, {
      headers: { origin, cookie: cookie! },
    }));
    expect(callback.status).toBe(302);
    const [row] = await migrator.client`select a.provider_id, s.id as session_id, ta.terms_version_id, ad.declaration_version from public."user" u join public.account a on a.user_id = u.id join public.session s on s.user_id = u.id join public.terms_acceptances ta on ta.user_id = u.id join public.age_declarations ad on ad.user_id = u.id where u.email = 'browser-registration@example.test'`;
    expect(row).toMatchObject({ provider_id: "google", terms_version_id: documentId, declaration_version: "age-16-v1" });
    expect(row?.session_id).toBeTruthy();
  });

  it("notifies Worker revocation for every session before Better Auth removes them", async () => {
    const revokeSessions = vi.fn(async () => undefined);
    const app = createProductionAuthApp({ revokeSessions });
    const firstToken = nativeToken(await signUp(app));
    const secondToken = nativeToken(await signIn(app));

    const firstSession = await app.fetch(request("/api/auth/get-session", {
      headers: { authorization: `Bearer ${firstToken}` },
    }));
    const first = await firstSession.json() as { user: { id: string }; session: { id: string } };
    const secondSession = await app.fetch(request("/api/auth/get-session", {
      headers: { authorization: `Bearer ${secondToken}` },
    }));
    const second = await secondSession.json() as { session: { id: string } };

    const revoked = await app.fetch(request("/api/auth/revoke-sessions", {
      method: "POST",
      headers: { authorization: `Bearer ${secondToken}` },
    }));

    expect(revoked.status).toBe(200);
    expect(revokeSessions).toHaveBeenCalledWith(first.user.id, expect.arrayContaining([
      first.session.id,
      second.session.id,
    ]));
    await expect((await app.fetch(request("/api/auth/get-session", {
      headers: { authorization: `Bearer ${firstToken}` },
    }))).json()).resolves.toBeNull();
    await expect((await app.fetch(request("/api/auth/get-session", {
      headers: { authorization: `Bearer ${secondToken}` },
    }))).json()).resolves.toBeNull();
  });

  it("atomically admits only one case-insensitive concurrent username claim", async () => {
    const bodies = ["first", "second"].map((name) => request("/api/auth/sign-up/email", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name, username: "Race_Handle", email: `${name}@example.test`, password: "not-a-real-password" }),
    }));
    const responses = await Promise.all(bodies.map((body) => createProductionApp().fetch(body)));
    expect(responses.filter((response) => response.status === 200)).toHaveLength(1);
    const [row] = await migrator.client`select count(*)::int as count from public."user" where lower(username) = 'race_handle'`;
    expect(row?.count).toBe(1);
  });

  it("shares recovery limits across fresh Worker app instances using Cloudflare's edge IP", async () => {
    const statuses: number[] = [];
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const response = await createProductionApp().fetch(request("/api/auth/request-password-reset", {
        method: "POST",
        headers: { "content-type": "application/json", "cf-connecting-ip": "198.51.100.10" },
        body: JSON.stringify({ email: "not-a-user@example.test", redirectTo: `${origin}/reset-password` }),
      }));
      statuses.push(response.status);
    }

    expect(statuses.slice(0, 3)).toEqual([400, 400, 400]);
    expect(statuses[3]).toBe(429);
  });

  it("rejects invalid credentials and does not mount auth with incomplete bindings", async () => {
    const invalidToken = await createProductionApp().fetch(request("/api/auth/get-session", {
      headers: { authorization: "Bearer invalid-token" },
    }));
    expect(invalidToken.status).toBe(200);
    await expect(invalidToken.json()).resolves.toBeNull();

    const unconfigured = createAppForEnv({
      HYPERDRIVE: { connectionString: requireLocalTestUrl(appUrl, "TEST_APP_DATABASE_URL") },
      BETTER_AUTH_SECRET: "too-short",
      BETTER_AUTH_BASE_URL: origin,
      BETTER_AUTH_TRUSTED_ORIGINS: trustedOrigins,
    });
    expect((await unconfigured.fetch(request("/api/auth/get-session"))).status).toBe(404);
  });
});
