import { createDayliDatabase, schema, sql } from "@dayli/db";
import { count, eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
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
const allowRateLimit = { limit: async () => ({ success: true }) };
const rateLimitBindings = {
  API_RATE_LIMIT_SCOPE: "test",
  API_INGRESS_RATE_LIMIT: allowRateLimit,
  API_READ_RATE_LIMIT: allowRateLimit,
  API_WRITE_RATE_LIMIT: allowRateLimit,
  API_MESSAGE_RATE_LIMIT: allowRateLimit,
  API_MEDIA_RATE_LIMIT: allowRateLimit,
  API_REALTIME_RATE_LIMIT: allowRateLimit,
  API_DIRECT_PUSH_RATE_LIMIT: allowRateLimit,
};

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
    ...rateLimitBindings,
  };
}

function createProductionApp() {
  return createAppForEnv(productionAuthEnvironment());
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
  if (!headers.has("cf-connecting-ip")) headers.set("cf-connecting-ip", "198.51.100.9");
  return new Request(`${origin}${path}`, { ...init, headers });
}

function nativeToken(response: Response) {
  const token = response.headers.get("set-auth-token");
  expect(token).toBeTruthy();
  return token!;
}

async function signUp(app: ReturnType<typeof createProductionApp>, email = "postgres@example.test") {
  return app.fetch(request("/api/auth/sign-up/email", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "PostgreSQL User", username: `postgres_${email.replace(/[^a-z0-9]/gi, "_").toLowerCase()}`.slice(0, 30), email, password: "not-a-real-password" }),
  }));
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
    await migrator.db.execute(sql.raw('truncate table public."rateLimit", public.account, public.session, public.verification, public."user" cascade'));
  });

  afterAll(async () => {
    await migrator.close();
  });

  it("creates empty session and verification target tables", async () => {
    const [row] = await migrator.db.select({
      sessions: sql<number>`(select count(*) from ${schema.session})::int`,
      verifications: sql<number>`(select count(*) from ${schema.verification})::int`,
    }).from(sql`(values (1)) as query_source`);
    expect(row).toMatchObject({ sessions: 0, verifications: 0 });
  });

  it("preserves stable text IDs, profile fields, and account record shape", async () => {
    await migrator.db.insert(schema.user).values({
      id: "schema-user-id",
      name: "Schema User",
      username: "schema_user",
      displayUsername: "Schema",
      bio: "Bio",
      mbti: "INTJ",
      whatIDo: "Student",
      listeningTo: "Music",
      profileVisibility: "private",
      email: "schema@example.test",
      tier: "pro",
      role: "user",
      banned: false,
    });
    await migrator.db.insert(schema.account).values({
      id: "schema-account-id",
      accountId: "schema-account",
      providerId: "credential",
      userId: "schema-user-id",
      password: "test-password",
    });

    const [row] = await migrator.db
      .select({
        id: schema.user.id,
        username: schema.user.username,
        profileVisibility: schema.user.profileVisibility,
        tier: schema.user.tier,
        userId: schema.account.userId,
        providerId: schema.account.providerId,
      })
      .from(schema.user)
      .innerJoin(schema.account, eq(schema.account.userId, schema.user.id))
      .where(eq(schema.user.id, "schema-user-id"));
    expect(row).toMatchObject({
      id: "schema-user-id",
      username: "schema_user",
      profileVisibility: "private",
      tier: "pro",
      userId: "schema-user-id",
      providerId: "credential",
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
    await migrator.db.update(schema.session).set({ expiresAt: sql`now() - interval '1 second'` });
    const expired = await secondApp.fetch(request("/api/auth/get-session", {
      headers: { authorization: `Bearer ${expiryToken}` },
    }));
    await expect(expired.json()).resolves.toBeNull();
  });

  it("records explicit acceptance for an existing signed-in user without inferring it from login", async () => {
    const app = createProductionApp();
    const token = nativeToken(await signUp(app, "legal-existing@example.test"));
    const termsId = `auth-legal-${crypto.randomUUID()}`;
    const contentDigest = "c".repeat(64);
    const [owner] = await migrator.db.select({ id: schema.user.id }).from(schema.user).where(eq(schema.user.email, "legal-existing@example.test"));
    if (!owner) throw new Error("Expected registered user.");
    try {
      await migrator.db.insert(schema.legalDocumentVersions).values({
        id: termsId, kind: "terms", version: 1024, contentDigest,
        status: "effective", effectiveAt: new Date("2026-01-01T00:00:00Z"),
      });
      const freshSignup = await signUp(app, "legal-unproved@example.test");
      expect(freshSignup.ok).toBe(false);
      expect(await migrator.db.select({ id: schema.user.id }).from(schema.user).where(eq(schema.user.email, "legal-unproved@example.test"))).toEqual([]);
      const admissionToken = Array.from(crypto.getRandomValues(new Uint8Array(32)), (byte) => byte.toString(16).padStart(2, "0")).join("");
      const admissionBinding = Array.from(crypto.getRandomValues(new Uint8Array(32)), (byte) => byte.toString(16).padStart(2, "0")).join("");
      const hash = async (text: string) => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text))), (byte) => byte.toString(16).padStart(2, "0")).join("");
      await migrator.db.insert(schema.registrationIntents).values({
        tokenDigest: await hash(admissionToken),
        flowBindingDigest: await hash(`email:${admissionBinding}`),
        termsVersionId: termsId, ageDeclarationVersion: "age-16-v1", expiresAt: sql`now() + interval '10 minutes'`,
      });
      const admitted = await app.fetch(request("/api/auth/sign-up/email", {
        method: "POST", headers: {
          "content-type": "application/json", "x-dayli-registration-intent": admissionToken, "x-dayli-registration-binding": admissionBinding,
        },
        body: JSON.stringify({ name: "Admitted User", username: "legal_admitted", email: "legal-admitted@example.test", password: "not-a-real-password" }),
      }));
      expect(admitted.status).toBe(200);
      expect(JSON.stringify(await admitted.json())).not.toContain(admissionToken);
      const [admittedUser] = await migrator.db.select({ id: schema.user.id, admission: schema.user.legal_registration_admission })
        .from(schema.user).where(eq(schema.user.email, "legal-admitted@example.test"));
      expect(admittedUser?.admission).toBeNull();
      await migrator.db.update(schema.user).set({ legal_registration_admission: admissionToken }).where(eq(schema.user.id, admittedUser!.id));
      const [protectedUser] = await migrator.db.select({ bridge: schema.user.legal_registration_admission }).from(schema.user).where(eq(schema.user.id, admittedUser!.id));
      expect(protectedUser?.bridge).toBeNull();
      expect(await migrator.db.select().from(schema.termsAcceptances).where(eq(schema.termsAcceptances.userId, admittedUser!.id))).toHaveLength(1);
      expect(await migrator.db.select().from(schema.ageDeclarations).where(eq(schema.ageDeclarations.userId, admittedUser!.id))).toHaveLength(1);
      expect((await app.fetch(request("/api/auth/sign-up/email", {
        method: "POST", headers: {
          "content-type": "application/json", "x-dayli-registration-intent": admissionToken, "x-dayli-registration-binding": admissionBinding,
        },
        body: JSON.stringify({ name: "Replay User", username: "legal_replay", email: "legal-replay@example.test", password: "not-a-real-password" }),
      }))).ok).toBe(false);
      const blocked = await app.fetch(request("/api/v1/account/status", { headers: { authorization: `Bearer ${token}` } }));
      await expect(blocked.json()).resolves.toMatchObject({ restriction: "terms_blocked" });
      const signInAgain = await app.fetch(request("/api/auth/sign-in/email", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: "legal-existing@example.test", password: "not-a-real-password" }),
      }));
      expect(signInAgain.status).toBe(200);
      expect(await migrator.db.select().from(schema.termsAcceptances).where(eq(schema.termsAcceptances.userId, owner.id))).toEqual([]);

      const acceptance = await app.fetch(request("/api/v1/legal/acceptance", {
        method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify({ termsVersionId: termsId, termsContentDigest: contentDigest, acceptedTermsAndDeclaredAge16: true }),
      }));
      // Database activation alone is insufficient while bundled documents
      // remain drafts. No production path may record this synthetic policy.
      expect(acceptance.status).toBe(409);
      const stillBlocked = await app.fetch(request("/api/v1/account/status", { headers: { authorization: `Bearer ${token}` } }));
      await expect(stillBlocked.json()).resolves.toMatchObject({ restriction: "terms_blocked" });
      expect(await migrator.db.select().from(schema.termsAcceptances).where(eq(schema.termsAcceptances.userId, owner.id))).toEqual([]);
      expect(await migrator.db.select().from(schema.ageDeclarations).where(eq(schema.ageDeclarations.userId, owner.id))).toEqual([]);
    } finally {
      await migrator.db.delete(schema.user).where(eq(schema.user.email, "legal-admitted@example.test"));
      await migrator.db.delete(schema.user).where(eq(schema.user.id, owner.id));
      await migrator.db.delete(schema.registrationIntents).where(eq(schema.registrationIntents.termsVersionId, termsId));
      await migrator.db.delete(schema.legalDocumentVersions).where(eq(schema.legalDocumentVersions.id, termsId));
    }
  });

  it("admits a verified native Google user only with the correct fresh registration flow", async () => {
    const termsId = `native-registration-${crypto.randomUUID()}`;
    const email = "native-registration@example.test";
    await migrator.db.insert(schema.legalDocumentVersions).values({
      id: termsId, kind: "terms", version: Math.floor(Math.random() * 1_000_000_000) + 1, contentDigest: "a".repeat(64),
    });
    await migrator.db.execute(sql`update public.legal_document_versions set status = 'effective', effective_at = now() - interval '1 second' where id = ${termsId}`);
    const token = Array.from(crypto.getRandomValues(new Uint8Array(32)), (byte) => byte.toString(16).padStart(2, "0")).join("");
    const binding = Array.from(crypto.getRandomValues(new Uint8Array(32)), (byte) => byte.toString(16).padStart(2, "0")).join("");
    const hash = async (value: string) => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))), (byte) => byte.toString(16).padStart(2, "0")).join("");
    await migrator.db.insert(schema.registrationIntents).values({
      tokenDigest: await hash(token), flowBindingDigest: await hash(`google_native:${binding}`),
      termsVersionId: termsId, ageDeclarationVersion: "age-16-v1", expiresAt: sql`now() + interval '10 minutes'`,
    });
    try {
      const { privateKey, publicKey } = await generateKeyPair("RS256");
      const jwk = await exportJWK(publicKey);
      jwk.kid = "native-registration-test-key";
      const idToken = await new SignJWT({ name: "Native Registrant", email, email_verified: true })
        .setProtectedHeader({ alg: "RS256", kid: jwk.kid })
        .setIssuer("https://accounts.google.com").setAudience("ios-client-id")
        .setSubject(`native-${crypto.randomUUID()}`).setIssuedAt().setExpirationTime("5m").sign(privateKey);
      vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ keys: [jwk] }), { status: 200, headers: { "content-type": "application/json" } })));
      const app = createAppForEnv({
        ...productionAuthEnvironment(), GOOGLE_WEB_CLIENT_ID: "web-client-id", GOOGLE_IOS_CLIENT_ID: "ios-client-id",
        GOOGLE_ANDROID_CLIENT_ID: "android-client-id", GOOGLE_CLIENT_SECRET: "test-google-client-secret",
      });
      const signInGoogle = (headers: Record<string, string>) => app.fetch(request("/api/auth/sign-in/social", {
        method: "POST", headers: { "content-type": "application/json", ...headers },
        body: JSON.stringify({ provider: "google", idToken: { token: idToken, accessToken: "test-access-token" } }),
      }));
      expect((await signInGoogle({})).ok).toBe(false);
      expect((await signInGoogle({ "x-dayli-registration-intent": token, "x-dayli-registration-binding": "0".repeat(64) })).ok).toBe(false);
      const [unused] = await migrator.db.select({ consumedAt: schema.registrationIntents.consumedAt }).from(schema.registrationIntents)
        .where(eq(schema.registrationIntents.tokenDigest, await hash(token)));
      expect(unused?.consumedAt).toBeNull();
      expect(await migrator.db.select().from(schema.user).where(eq(schema.user.email, email))).toEqual([]);
      const admitted = await signInGoogle({ "x-dayli-registration-intent": token, "x-dayli-registration-binding": binding });
      expect(admitted.status).toBe(200);
      const body = await admitted.json() as { user: { id: string } };
      expect(JSON.stringify(body)).not.toContain(token);
      const [user] = await migrator.db.select({ id: schema.user.id, bridge: schema.user.legal_registration_admission }).from(schema.user).where(eq(schema.user.email, email));
      expect(user?.id).toBe(body.user.id);
      expect(user?.bridge).toBeNull();
      expect(await migrator.db.select().from(schema.termsAcceptances).where(eq(schema.termsAcceptances.userId, user!.id))).toHaveLength(1);
      expect(await migrator.db.select().from(schema.ageDeclarations).where(eq(schema.ageDeclarations.userId, user!.id))).toHaveLength(1);
    } finally {
      vi.unstubAllGlobals();
      await migrator.db.delete(schema.user).where(eq(schema.user.email, email));
      await migrator.db.delete(schema.registrationIntents).where(eq(schema.registrationIntents.termsVersionId, termsId));
      await migrator.db.delete(schema.legalDocumentVersions).where(eq(schema.legalDocumentVersions.id, termsId));
    }
  });

  it("binds a Google browser intent to Better Auth state and consumes it only after a successful callback", async () => {
    const termsId = `google-registration-${crypto.randomUUID()}`;
    const email = "google-registration@example.test";
    await migrator.db.insert(schema.legalDocumentVersions).values({
      id: termsId, kind: "terms", version: Math.floor(Math.random() * 1_000_000_000) + 1, contentDigest: "a".repeat(64),
    });
    await migrator.db.execute(sql`update public.legal_document_versions set status = 'effective', effective_at = now() - interval '1 second' where id = ${termsId}`);
    const token = Array.from(crypto.getRandomValues(new Uint8Array(32)), (byte) => byte.toString(16).padStart(2, "0")).join("");
    const binding = Array.from(crypto.getRandomValues(new Uint8Array(32)), (byte) => byte.toString(16).padStart(2, "0")).join("");
    const hash = async (value: string) => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))), (byte) => byte.toString(16).padStart(2, "0")).join("");
    await migrator.db.insert(schema.registrationIntents).values({
      tokenDigest: await hash(token), flowBindingDigest: await hash(`google_browser:${binding}`),
      termsVersionId: termsId, ageDeclarationVersion: "age-16-v1", expiresAt: sql`now() + interval '10 minutes'`,
    });
    try {
      const { privateKey, publicKey } = await generateKeyPair("RS256");
      const jwk = await exportJWK(publicKey);
      jwk.kid = "google-registration-test-key";
      const idToken = await new SignJWT({ name: "Google Registrant", email, email_verified: true })
        .setProtectedHeader({ alg: "RS256", kid: jwk.kid })
        .setIssuer("https://accounts.google.com").setAudience("web-client-id")
        .setSubject(`registration-${crypto.randomUUID()}`).setIssuedAt().setExpirationTime("5m").sign(privateKey);
      vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
        access_token: "browser-access-token", token_type: "Bearer", expires_in: 300, id_token: idToken, keys: [jwk],
      }), { status: 200, headers: { "content-type": "application/json" } })));
      const app = createAppForEnv({
        ...productionAuthEnvironment(), GOOGLE_WEB_CLIENT_ID: "web-client-id", GOOGLE_IOS_CLIENT_ID: "ios-client-id",
        GOOGLE_ANDROID_CLIENT_ID: "android-client-id", GOOGLE_CLIENT_SECRET: "test-google-client-secret",
      });
      const started = await app.fetch(request("/api/auth/sign-in/social", {
        method: "POST", headers: { "content-type": "application/json", "x-dayli-registration-intent": token, "x-dayli-registration-binding": binding },
        body: JSON.stringify({ provider: "google", callbackURL: `${origin}/welcome`, disableRedirect: true }),
      }));
      expect(started.status).toBe(200);
      const { url } = await started.json() as { url: string };
      const state = new URL(url).searchParams.get("state");
      expect(state).toBeTruthy();
      const cookie = started.headers.get("set-cookie");
      expect(cookie).toBeTruthy();
      expect(cookie).not.toContain(token);
      const [bound] = await migrator.db.select({ stateDigest: schema.registrationIntents.flowBindingDigest })
        .from(schema.registrationIntents).where(eq(schema.registrationIntents.tokenDigest, await hash(token)));
      expect(bound?.stateDigest).toBe(await hash(`google_browser:${state}`));
      const callback = await app.fetch(request(`/api/auth/callback/google?state=${encodeURIComponent(state!)}&code=test-code`, { headers: { cookie: cookie! } }));
      expect(callback.status).toBe(302);
      expect(callback.headers.get("location")).toContain("/welcome");
      expect(callback.headers.get("location")).not.toContain(token);
      const [user] = await migrator.db.select({ id: schema.user.id, bridge: schema.user.legal_registration_admission }).from(schema.user).where(eq(schema.user.email, email));
      expect(user?.bridge).toBeNull();
      expect(await migrator.db.select().from(schema.termsAcceptances).where(eq(schema.termsAcceptances.userId, user!.id))).toHaveLength(1);
      expect(await migrator.db.select().from(schema.ageDeclarations).where(eq(schema.ageDeclarations.userId, user!.id))).toHaveLength(1);
      const [consumed] = await migrator.db.select({ consumedAt: schema.registrationIntents.consumedAt }).from(schema.registrationIntents)
        .where(eq(schema.registrationIntents.tokenDigest, await hash(token)));
      expect(consumed?.consumedAt).toBeInstanceOf(Date);
    } finally {
      vi.unstubAllGlobals();
      await migrator.db.delete(schema.user).where(eq(schema.user.email, email));
      await migrator.db.delete(schema.registrationIntents).where(eq(schema.registrationIntents.termsVersionId, termsId));
      await migrator.db.delete(schema.legalDocumentVersions).where(eq(schema.legalDocumentVersions.id, termsId));
    }
  });

  it("reads account policy only for the authenticated session owner and cannot bypass a pending deletion", async () => {
    const app = createProductionApp();
    const ownerToken = nativeToken(await signUp(app, "policy-owner@example.test"));
    const otherToken = nativeToken(await signUp(app, "policy-other@example.test"));
    const ownerSession = await app.fetch(request("/api/auth/get-session", { headers: { authorization: `Bearer ${ownerToken}` } }));
    const owner = await ownerSession.json() as { user: { id: string } };
    const requestedAt = new Date("2026-09-01T00:00:00.000Z");
    await migrator.db.insert(schema.accountLifecycles).values({
      userId: owner.user.id,
      state: "pending_deletion",
      requestId: "policy-owner-request",
      idempotencyKeyDigest: "a".repeat(64),
      requestedAt,
      cancelUntil: new Date("2026-09-08T00:00:00.000Z"),
      purgeDueAt: new Date("2026-09-15T00:00:00.000Z"),
    });

    const ownerStatus = await app.fetch(request("/api/v1/account/status", { headers: { authorization: `Bearer ${ownerToken}` } }));
    expect(ownerStatus.status).toBe(200);
    expect(ownerStatus.headers.get("cache-control")).toBe("no-store");
    await expect(ownerStatus.json()).resolves.toMatchObject({ restriction: "pending_deletion" });

    const otherStatus = await app.fetch(request("/api/v1/account/policy", { headers: { authorization: `Bearer ${otherToken}` } }));
    expect(otherStatus.status).toBe(200);
    await expect(otherStatus.json()).resolves.toMatchObject({ restriction: "active" });

    const publicGuest = await app.fetch(request("/api/v1/test"));
    expect(publicGuest.status).toBe(200);
    const publicRestricted = await app.fetch(request("/api/v1/test", { headers: { authorization: `Bearer ${ownerToken}` } }));
    expect(publicRestricted.status).toBe(200);

    const blocked = await app.fetch(request("/api/v1/feed", { headers: { authorization: `Bearer ${ownerToken}` } }));
    expect(blocked.status).toBe(403);
    await expect(blocked.json()).resolves.toMatchObject({ error: { code: "FORBIDDEN", details: { restriction: "pending_deletion" } } });
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
    const [row] = await migrator.db
      .select({ count: count() })
      .from(schema.user)
      .where(sql`lower(${schema.user.username}) = ${"race_handle"}`);
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
      ...rateLimitBindings,
    });
    expect((await unconfigured.fetch(request("/api/auth/get-session"))).status).toBe(404);
  });
});
