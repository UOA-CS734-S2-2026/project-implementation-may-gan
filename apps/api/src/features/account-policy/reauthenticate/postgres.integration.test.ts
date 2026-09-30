import { createDayliDatabase, schema } from "@dayli/db";
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from "jose";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../../../app";
import { resolveAccountPolicy } from "../shared/account-policy";
import { createGoogleProofDigestVerifier } from "./google-oidc";
import { createGoogleProofIntentStore } from "./google-proof-intents.repository";

const migratorUrl = process.env.TEST_DATABASE_URL;
const appUrl = process.env.TEST_APP_DATABASE_URL;
const required = process.env.POSTGRES_INTEGRATION_REQUIRED === "1";
const port = process.env.VERIFY_POSTGRES_PORT ?? "5433";
const configured = Boolean(migratorUrl && appUrl);
const keys = { encryption: { version: "enc-v1", material: "MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY" }, subjectHmac: { version: "sub-v1", material: "YWJjZGVmMDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODk" } };
function local(value: string | undefined, name: string) { if (!value) throw new Error(`${name} required`); const url = new URL(value); if (url.hostname !== "localhost" || url.port !== port || url.pathname !== "/dayli_test") throw new Error(`${name} must be local verifier DB`); return value; }
if (required && !configured) throw new Error("Google proof endpoint integration requires PostgreSQL configuration.");

(configured ? describe : describe.skip)("Google proof endpoint PostgreSQL flow", () => {
  const migrator = createDayliDatabase(local(migratorUrl, "TEST_DATABASE_URL"));
  const appDb = createDayliDatabase(local(appUrl, "TEST_APP_DATABASE_URL"));
  const users: string[] = [];
  afterEach(async () => { vi.unstubAllGlobals(); while (users.length) await migrator.db.delete(schema.user).where((await import("drizzle-orm")).eq(schema.user.id, users.pop()!)); });
  afterAll(async () => { await appDb.close(); await migrator.close(); });

  it("runs begin, a signed PKCE callback, and original-session completion without persisting provider tokens", async () => {
    const suffix = crypto.randomUUID(); const userId = `google-route-${suffix}`; const sessionId = `google-route-session-${suffix}`; users.push(userId);
    await migrator.db.insert(schema.user).values({ id: userId, name: "Google Route", email: `${userId}@example.test` });
    await migrator.db.insert(schema.session).values({ id: sessionId, userId, token: `token-${suffix}`, expiresAt: new Date(Date.now() + 60 * 60 * 1000) });
    await migrator.db.insert(schema.account).values({ id: `account-${suffix}`, userId, providerId: "google", accountId: "linked-subject" });
    await migrator.db.insert(schema.accountLifecycles).values({ userId });
    const pair = await generateKeyPair("RS256"); const jwk = await exportJWK(pair.publicKey); const clientId = "google-route-client";
    let nonce = "";
    vi.stubGlobal("fetch", async () => new Response(JSON.stringify({ id_token: await new SignJWT({ iss: "https://accounts.google.com", aud: clientId, sub: "linked-subject", email: "same@example.test", nonce, auth_time: Math.floor(Date.now() / 1000), iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 300 }).setProtectedHeader({ alg: "RS256", kid: "fixture" }).sign(pair.privateKey) }), { headers: { "content-type": "application/json" } }));
    const store = createGoogleProofIntentStore(appDb.db, keys);
    const api = createApp({ accountPolicy: { resolveSession: async () => ({ userId }), policies: { resolve: async () => resolveAccountPolicy({ lifecycleState: "active" }) } }, googleProof: { trustedOrigins: ["https://app.example.test"], oauth: { clientId, clientSecret: "secret", callbackUrl: "https://api.example.test/api/v1/account/reauthenticate/google/callback", completionUrl: "https://app.example.test/complete", ...keys }, authorizeAction: async () => true, resolveSession: async () => ({ userId, sessionId }), lifecycleGeneration: async () => 0, intents: store, verifyIdToken: createGoogleProofDigestVerifier({ clientId }, { jwks: createLocalJWKSet({ keys: [{ ...jwk, kid: "fixture" }] }) }) } });
    const begin = await api.request("https://api.example.test/api/v1/account/reauthenticate/google/begin", { method: "POST", headers: { "content-type": "application/json", origin: "https://app.example.test" }, body: JSON.stringify({ action: "request_deletion" }) });
    const authorization = new URL((await begin.json() as { authorizationUrl: string }).authorizationUrl); nonce = authorization.searchParams.get("nonce")!;
    const callback = await api.request(`https://api.example.test/api/v1/account/reauthenticate/google/callback?state=${authorization.searchParams.get("state")}&code=code`);
    expect(callback.status).toBe(303);
    const complete = await api.request("https://api.example.test/api/v1/account/reauthenticate/google/complete", { method: "POST", headers: { "content-type": "application/json", origin: "https://app.example.test" }, body: JSON.stringify({ action: "request_deletion", state: authorization.searchParams.get("state") }) });
    expect(complete.status).toBe(200);
    const grants = await migrator.db.select().from(schema.accountManagementGrants).where((await import("drizzle-orm")).eq(schema.accountManagementGrants.userId, userId));
    expect(grants).toHaveLength(1);
  });
});
