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

async function signedGoogleToken(audience: string | string[], subject: string, email: string, claims: { azp?: string; expiresAt?: number | null; issuedAt?: number } = {}) {
  const { privateKey, publicKey } = await generateKeyPair("RS256");
  const publicJwk = await exportJWK(publicKey);
  publicJwk.kid = `postgres-registration-google-key-${crypto.randomUUID()}`;
  const jwt = new SignJWT({
    email,
    azp: claims.azp,
    email_verified: true,
    name: "PostgreSQL Google User",
    picture: "https://images.example.test/google-avatar.png",
  })
    .setProtectedHeader({ alg: "RS256", kid: publicJwk.kid })
    .setIssuedAt(claims.issuedAt)
    .setIssuer("https://accounts.google.com")
    .setAudience(audience)
    .setSubject(subject);
  if (claims.expiresAt !== null) jwt.setExpirationTime(claims.expiresAt ?? "5m");
  const token = await jwt.sign(privateKey);
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
    expect(body.user as Record<string, unknown>).not.toHaveProperty("legal_registration_admission");
    expect(body.user as Record<string, unknown>).not.toHaveProperty("legalRegistrationAdmission");
    const sessionView = await app.fetch(request("/api/auth/get-session", {
      headers: { authorization: `Bearer ${nativeToken(accepted!)}` },
    }));
    expect(sessionView.status).toBe(200);
    const sessionBody = await sessionView.json() as { user?: Record<string, unknown>; session?: Record<string, unknown> };
    for (const value of [sessionBody.user, sessionBody.session]) {
      expect(value).not.toHaveProperty("legal_registration_admission");
      expect(value).not.toHaveProperty("legalRegistrationAdmission");
    }
    const [termsAcceptance] = await migrator.client`select accepted_at from public.terms_acceptances where user_id = ${body.user.id} and terms_version_id = ${documentId}`;
    const [ageDeclaration] = await migrator.client`select declaration_version from public.age_declarations where user_id = ${body.user.id}`;
    const [account] = await migrator.client`select provider_id from public.account where user_id = ${body.user.id}`;
    const [session] = await migrator.client`select id from public.session where user_id = ${body.user.id}`;
    expect(termsAcceptance?.accepted_at).toBeTruthy();
    expect(ageDeclaration).toEqual({ declaration_version: "age-16-v1" });
    expect(account).toEqual({ provider_id: "credential" });
    expect(session?.id).toBeTruthy();
  });

  it("rolls back consumed admission proof when a legal write fails inside the user insert", async () => {
    const canonicalContent = "# Rollback Terms\n\nCanonical test content.";
    const digest = [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonicalContent)))]
      .map((byte) => byte.toString(16).padStart(2, "0")).join("");
    const documentId = `rollback-terms-${crypto.randomUUID()}`;
    const databaseSchema = (await import("@dayli/db")).schema;
    await migrator.db.insert(databaseSchema.legalDocumentVersions).values({
      id: documentId, kind: "terms", version: Math.floor(Math.random() * 1_000_000_000) + 1,
      contentDigest: digest, status: "effective", effectiveAt: new Date(Date.now() - 1_000),
    });
    await migrator.db.insert(databaseSchema.legalDocumentContents).values({ termsVersionId: documentId, canonicalContent });
    const app = createProductionApp();
    const issued = await app.fetch(request("/api/v1/legal/registration-intents", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ flow: "email", acceptTerms: true, declareAge16OrOlder: true }),
    }));
    expect(issued.status).toBe(201);
    const proof = await issued.json() as { intent: string; flowBinding: string };
    await migrator.client.unsafe(`
      create schema test_legal_admission_fault;
      create function test_legal_admission_fault.fail_acceptance() returns trigger language plpgsql as $$
      begin
        if new.terms_version_id = '${documentId}' then raise exception 'fixture legal write failure'; end if;
        return new;
      end;
      $$;
      create trigger test_legal_admission_fault_trigger after insert on public.terms_acceptances
      for each row execute function test_legal_admission_fault.fail_acceptance();
    `);
    try {
      const failed = await app.fetch(signUpRequest("rollback@example.test", {
        "x-dayli-registration-intent": proof.intent,
        "x-dayli-registration-binding": proof.flowBinding,
      }));
      expect(failed.ok).toBe(false);
      const [afterFailure] = await migrator.client`
        select
          (select count(*)::int from public."user" where email = 'rollback@example.test') as users,
          (select count(*)::int from public.terms_acceptances where terms_version_id = ${documentId}) as acceptances,
          (select count(*)::int from public.age_declarations) as declarations,
          (select consumed_at is null as reusable from public.registration_intents where token_digest = encode(digest(convert_to(${proof.intent}, 'UTF8'), 'sha256'), 'hex')) as reusable
      `;
      expect(afterFailure).toEqual({ users: 0, acceptances: 0, declarations: 0, reusable: true });
    } finally {
      await migrator.client.unsafe("drop schema test_legal_admission_fault cascade");
    }
    const retried = await app.fetch(signUpRequest("rollback@example.test", {
      "x-dayli-registration-intent": proof.intent,
      "x-dayli-registration-binding": proof.flowBinding,
    }));
    expect(retried.status).toBe(200);
    const [afterRetry] = await migrator.client`
      select
        (select count(*)::int from public."user" where email = 'rollback@example.test') as users,
        (select count(*)::int from public.terms_acceptances where terms_version_id = ${documentId}) as acceptances,
        (select count(*)::int from public.age_declarations) as declarations,
        (select consumed_at is not null as consumed from public.registration_intents where token_digest = encode(digest(convert_to(${proof.intent}, 'UTF8'), 'sha256'), 'hex')) as consumed
    `;
    expect(afterRetry).toEqual({ users: 1, acceptances: 1, declarations: 1, consumed: true });
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
    const invalidSignature = await signedGoogleToken("ios-client-id", `invalid-signature-${crypto.randomUUID()}`, "native-invalid-signature@example.test");
    const invalidAudience = await signedGoogleToken("untrusted-client-id", `invalid-audience-${crypto.randomUUID()}`, "native-invalid-audience@example.test");
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ keys: [publicJwk, invalidAudience.publicJwk] }), { status: 200 })));

    const missing = await app.fetch(request("/api/auth/sign-in/social", {
      method: "POST", headers: { "content-type": "application/json", "cf-connecting-ip": "198.51.100.10" },
      body: JSON.stringify({ provider: "google", idToken: { token } }),
    }));
    expect(missing.status).toBe(401);
    const [missingCount] = await migrator.client`select count(*)::int as count from public."user" where email = 'native-registration@example.test'`;
    expect(missingCount?.count).toBe(0);
    const signatureFailure = await app.fetch(request("/api/auth/sign-in/social", {
      method: "POST",
      headers: { "content-type": "application/json", "cf-connecting-ip": "198.51.100.11", "x-dayli-registration-intent": proof.intent, "x-dayli-registration-binding": proof.flowBinding },
      body: JSON.stringify({ provider: "google", idToken: { token: invalidSignature.token } }),
    }));
    const audienceFailure = await app.fetch(request("/api/auth/sign-in/social", {
      method: "POST",
      headers: { "content-type": "application/json", "cf-connecting-ip": "198.51.100.12", "x-dayli-registration-intent": proof.intent, "x-dayli-registration-binding": proof.flowBinding },
      body: JSON.stringify({ provider: "google", idToken: { token: invalidAudience.token } }),
    }));
    expect(signatureFailure.status).toBe(401);
    expect(audienceFailure.status).toBe(401);
    const [providerFailure] = await migrator.client`
      select
        (select count(*)::int from public."user" where email in ('native-invalid-signature@example.test', 'native-invalid-audience@example.test')) as users,
        (select count(*)::int from public.account where provider_id = 'google') as accounts,
        (select count(*)::int from public.session) as sessions,
        (select count(*)::int from public.terms_acceptances where terms_version_id = ${documentId}) as acceptances,
        (select count(*)::int from public.age_declarations) as declarations,
        (select consumed_at is null as reusable from public.registration_intents where token_digest = encode(digest(convert_to(${proof.intent}, 'UTF8'), 'sha256'), 'hex')) as reusable
    `;
    expect(providerFailure).toEqual({ users: 0, accounts: 0, sessions: 0, acceptances: 0, declarations: 0, reusable: true });
    const forged = await app.fetch(request("/api/auth/sign-in/social", {
      method: "POST",
      headers: { "content-type": "application/json", "cf-connecting-ip": "198.51.100.13", "x-dayli-registration-intent": proof.intent, "x-dayli-registration-binding": "0".repeat(64) },
      body: JSON.stringify({ provider: "google", idToken: { token } }),
    }));
    expect(forged.status).toBe(401);
    const [forgedCount] = await migrator.client`select count(*)::int as count from public."user" where email = 'native-registration@example.test'`;
    expect(forgedCount?.count).toBe(0);

    const admitted = await app.fetch(request("/api/auth/sign-in/social", {
      method: "POST",
      headers: { "content-type": "application/json", "cf-connecting-ip": "198.51.100.14", "x-dayli-registration-intent": proof.intent, "x-dayli-registration-binding": proof.flowBinding },
      body: JSON.stringify({ provider: "google", idToken: { token, accessToken: "native-access-token-fixture" } }),
    }));
    expect(admitted.status).toBe(200);
    const body = await admitted.json() as { user: { id: string } };
    expect(body.user as Record<string, unknown>).not.toHaveProperty("legal_registration_admission");
    expect(body.user as Record<string, unknown>).not.toHaveProperty("legalRegistrationAdmission");
    const nativeSession = await app.fetch(request("/api/auth/get-session", {
      headers: { authorization: `Bearer ${nativeToken(admitted)}` },
    }));
    expect(nativeSession.status).toBe(200);
    const nativeSessionBody = await nativeSession.json() as { user?: Record<string, unknown>; session?: Record<string, unknown> };
    for (const value of [nativeSessionBody.user, nativeSessionBody.session]) {
      expect(value).not.toHaveProperty("legal_registration_admission");
      expect(value).not.toHaveProperty("legalRegistrationAdmission");
    }
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
    expect(cookie!.includes(proof.intent)).toBe(false);
    expect(cookie!.includes(proof.flowBinding)).toBe(false);

    const callback = await app.fetch(new Request(`${origin}/api/auth/callback/google?state=${encodeURIComponent(state!)}&code=test-browser-code`, {
      headers: { origin, cookie: cookie! },
    }));
    expect(callback.status).toBe(302);
    const callbackLocation = callback.headers.get("location") ?? "";
    const callbackCookie = callback.headers.get("set-cookie") ?? "";
    expect(callbackLocation.includes(proof.intent)).toBe(false);
    expect(callbackLocation.includes(proof.flowBinding)).toBe(false);
    expect(callbackCookie.includes(proof.intent)).toBe(false);
    expect(callbackCookie.includes(proof.flowBinding)).toBe(false);
    const callbackCookies = (callback.headers as Headers & { getSetCookie?: () => string[] }).getSetCookie?.()
      ?? (callbackCookie ? [callbackCookie] : []);
    let browserSessionBody: { user?: Record<string, unknown>; session?: Record<string, unknown> } | null = null;
    for (const setCookie of callbackCookies) {
      const browserSession = await app.fetch(request("/api/auth/get-session", {
        headers: { cookie: setCookie.split(";", 1)[0]! },
      }));
      expect(browserSession.status).toBe(200);
      const candidate = await browserSession.json() as { user?: Record<string, unknown>; session?: Record<string, unknown> } | null;
      if (candidate) browserSessionBody = candidate;
    }
    expect(browserSessionBody).toBeTruthy();
    for (const value of [browserSessionBody?.user, browserSessionBody?.session]) {
      expect(value).not.toHaveProperty("legal_registration_admission");
      expect(value).not.toHaveProperty("legalRegistrationAdmission");
    }
    const [row] = await migrator.client`select a.provider_id, s.id as session_id, ta.terms_version_id, ad.declaration_version from public."user" u join public.account a on a.user_id = u.id join public.session s on s.user_id = u.id join public.terms_acceptances ta on ta.user_id = u.id join public.age_declarations ad on ad.user_id = u.id where u.email = 'browser-registration@example.test'`;
    expect(row).toMatchObject({ provider_id: "google", terms_version_id: documentId, declaration_version: "age-16-v1" });
    expect(row?.session_id).toBeTruthy();
  });

  it("fails closed for browser Google callback state and provider verification failures", async () => {
    const canonicalContent = "# Browser failure Terms\n\nCanonical test content.";
    const digest = [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonicalContent)))]
      .map((byte) => byte.toString(16).padStart(2, "0")).join("");
    const documentId = `browser-failure-terms-${crypto.randomUUID()}`;
    const databaseSchema = (await import("@dayli/db")).schema;
    await migrator.db.insert(databaseSchema.legalDocumentVersions).values({
      id: documentId, kind: "terms", version: Math.floor(Math.random() * 1_000_000_000) + 1,
      contentDigest: digest, status: "effective", effectiveAt: new Date(Date.now() - 1_000),
    });
    await migrator.db.insert(databaseSchema.legalDocumentContents).values({ termsVersionId: documentId, canonicalContent });
    const app = createProductionGoogleApp();
    const valid = await signedGoogleToken(["web-client-id", "ios-client-id"], `browser-valid-${crypto.randomUUID()}`, "browser-recovery@example.test", { azp: "web-client-id" });
    const invalidSignature = await signedGoogleToken("web-client-id", `browser-invalid-signature-${crypto.randomUUID()}`, "browser-invalid-signature@example.test");
    const invalidAudience = await signedGoogleToken("untrusted-client-id", `browser-invalid-audience-${crypto.randomUUID()}`, "browser-invalid-audience@example.test");
    let callbackToken = invalidSignature.token;
    let callbackKeys = [valid.publicJwk];
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      access_token: "test-browser-access-token", token_type: "Bearer", expires_in: 300, id_token: callbackToken, keys: callbackKeys,
    }), { status: 200, headers: { "content-type": "application/json" } })));
    const issue = async () => {
      const response = await app.fetch(request("/api/v1/legal/registration-intents", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ flow: "google_browser", acceptTerms: true, declareAge16OrOlder: true }),
      }));
      expect(response.status).toBe(201);
      return response.json() as Promise<{ intent: string; flowBinding: string }>;
    };
    const start = async (proof: { intent: string; flowBinding: string }, ip: string) => {
      const response = await app.fetch(request("/api/auth/sign-in/social", {
        method: "POST",
        headers: { "content-type": "application/json", "cf-connecting-ip": ip, "x-dayli-registration-intent": proof.intent, "x-dayli-registration-binding": proof.flowBinding },
        body: JSON.stringify({ provider: "google", callbackURL: `${origin}/welcome`, disableRedirect: true }),
      }));
      expect(response.status).toBe(200);
      const authorization = await response.json() as { url: string };
      const state = new URL(authorization.url).searchParams.get("state");
      const cookie = response.headers.get("set-cookie");
      expect(state).toBeTruthy();
      expect(cookie).toBeTruthy();
      return { state: state!, cookie: cookie! };
    };
    const assertRejected = async (proof: { intent: string }, email: string) => {
      const [result] = await migrator.client`
        select
          (select count(*)::int from public."user" where email = ${email}) as users,
          (select count(*)::int from public.account where provider_id = 'google') as accounts,
          (select count(*)::int from public.session) as sessions,
          (select count(*)::int from public.terms_acceptances where terms_version_id = ${documentId}) as acceptances,
          (select count(*)::int from public.age_declarations) as declarations,
          (select consumed_at is null as reusable from public.registration_intents where token_digest = encode(digest(convert_to(${proof.intent}, 'UTF8'), 'sha256'), 'hex')) as reusable
      `;
      expect(result).toEqual({ users: 0, accounts: 0, sessions: 0, acceptances: 0, declarations: 0, reusable: true });
    };

    const first = await issue();
    const firstStart = await start(first, "198.51.100.31");
    const missingState = await app.fetch(new Request(`${origin}/api/auth/callback/google?code=test-browser-code`, { headers: { origin, cookie: firstStart.cookie } }));
    expect(missingState.ok).toBe(false);
    await assertRejected(first, "browser-invalid-signature@example.test");
    const forgedState = await app.fetch(new Request(`${origin}/api/auth/callback/google?state=forged-state&code=test-browser-code`, { headers: { origin, cookie: firstStart.cookie } }));
    expect(forgedState.ok).toBe(false);
    await assertRejected(first, "browser-invalid-signature@example.test");
    const signatureFailure = await app.fetch(new Request(`${origin}/api/auth/callback/google?state=${encodeURIComponent(firstStart.state)}&code=test-browser-code`, { headers: { origin, cookie: firstStart.cookie } }));
    expect(signatureFailure.ok).toBe(false);
    await assertRejected(first, "browser-invalid-signature@example.test");
    const rebound = await app.fetch(request("/api/auth/sign-in/social", {
      method: "POST",
      headers: { "content-type": "application/json", "cf-connecting-ip": "198.51.100.32", "x-dayli-registration-intent": first.intent, "x-dayli-registration-binding": first.flowBinding },
      body: JSON.stringify({ provider: "google", callbackURL: `${origin}/welcome`, disableRedirect: true }),
    }));
    expect(rebound.status).toBe(403);

    const second = await issue();
    const secondStart = await start(second, "198.51.100.33");
    callbackToken = invalidAudience.token;
    callbackKeys = [invalidAudience.publicJwk];
    const audienceFailure = await app.fetch(new Request(`${origin}/api/auth/callback/google?state=${encodeURIComponent(secondStart.state)}&code=test-browser-code`, { headers: { origin, cookie: secondStart.cookie } }));
    expect(audienceFailure.ok).toBe(false);
    await assertRejected(second, "browser-invalid-audience@example.test");
    const staleCallback = await app.fetch(new Request(`${origin}/api/auth/callback/google?state=${encodeURIComponent(firstStart.state)}&code=test-browser-code`, { headers: { origin, cookie: firstStart.cookie } }));
    expect(staleCallback.ok).toBe(false);
    await assertRejected(second, "browser-invalid-audience@example.test");

    const now = Math.floor(Date.now() / 1000);
    const rejectedClaims: Array<{ audience: string | string[]; azp?: string; expiresAt?: number | null; issuedAt?: number }> = [
      { audience: "ios-client-id" },
      { audience: "android-client-id" },
      { audience: ["web-client-id", "ios-client-id"] },
      { audience: ["web-client-id", "ios-client-id"], azp: "ios-client-id" },
      { audience: ["web-client-id", "android-client-id"], azp: "android-client-id" },
      { audience: ["web-client-id", "other-client-id"], azp: "other-client-id" },
      { audience: "web-client-id", azp: "other-client-id" },
      { audience: "web-client-id", expiresAt: null },
      { audience: "web-client-id", issuedAt: now - 120, expiresAt: now - 60 },
    ];
    for (const [index, claims] of rejectedClaims.entries()) {
      const email = `browser-rejected-claims-${index}@example.test`;
      const fixture = await signedGoogleToken(claims.audience, `browser-claims-${crypto.randomUUID()}`, email, claims);
      callbackToken = fixture.token;
      callbackKeys = [fixture.publicJwk];
      const proof = await issue();
      const flow = await start(proof, `198.51.100.${40 + index}`);
      const rejected = await app.fetch(new Request(`${origin}/api/auth/callback/google?state=${encodeURIComponent(flow.state)}&code=test-browser-code`, { headers: { origin, cookie: flow.cookie } }));
      expect(rejected.ok).toBe(false);
      await assertRejected(proof, email);
    }

    const recovery = await issue();
    const recoveryStart = await start(recovery, "198.51.100.34");
    callbackToken = valid.token;
    callbackKeys = [valid.publicJwk];
    const recovered = await app.fetch(new Request(`${origin}/api/auth/callback/google?state=${encodeURIComponent(recoveryStart.state)}&code=test-browser-code`, { headers: { origin, cookie: recoveryStart.cookie } }));
    expect(recovered.status).toBe(302);
    const [recoveredUser] = await migrator.client`
      select count(*)::int as users, (select consumed_at is not null from public.registration_intents where token_digest = encode(digest(convert_to(${recovery.intent}, 'UTF8'), 'sha256'), 'hex')) as consumed
      from public."user" where email = 'browser-recovery@example.test'
    `;
    expect(recoveredUser).toEqual({ users: 1, consumed: true });
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
