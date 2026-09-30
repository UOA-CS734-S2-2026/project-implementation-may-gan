import { createDayliDatabase, schema } from "@dayli/db";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createAppForEnv } from "../../../app";

const databaseUrl = process.env.LIFECYCLE_AUTH_TEST_DATABASE_URL;
const appUrl = process.env.LIFECYCLE_AUTH_TEST_APP_DATABASE_URL;
const required = process.env.REQUIRE_LIFECYCLE_AUTH_TEST === "1";
const enabled = Boolean(databaseUrl && appUrl);
const port = process.env.VERIFY_POSTGRES_PORT ?? "5433";
const origin = "https://api.example.test";

function local(value: string | undefined, name: string, user: string) {
  if (!value) throw new Error(`${name} is required when REQUIRE_LIFECYCLE_AUTH_TEST=1.`);
  const url = new URL(value);
  if (url.hostname !== "localhost" || url.port !== port || url.pathname !== "/dayli_lifecycle_test" || url.username !== user) throw new Error(`${name} must target ${user}@localhost:${port}/dayli_lifecycle_test.`);
  return value;
}

if (required && !enabled) throw new Error("Lifecycle Better Auth integration requires isolated PostgreSQL URLs.");

(enabled ? describe : describe.skip)("account lifecycle through Better Auth", () => {
  const migrator = createDayliDatabase(local(databaseUrl, "LIFECYCLE_AUTH_TEST_DATABASE_URL", "migrator"));
  const app = createAppForEnv({
    HYPERDRIVE: { connectionString: local(appUrl, "LIFECYCLE_AUTH_TEST_APP_DATABASE_URL", "app") },
    BETTER_AUTH_SECRET: "lifecycle-auth-test-secret-that-is-at-least-32-characters",
    BETTER_AUTH_BASE_URL: origin,
    BETTER_AUTH_TRUSTED_ORIGINS: origin,
    ACCOUNT_DELETION_REQUESTS_ENABLED: "enabled",
  });

  const request = (path: string, init: RequestInit = {}) => {
    const headers = new Headers(init.headers);
    headers.set("origin", origin);
    return new Request(`${origin}${path}`, { ...init, headers });
  };
  const bearer = (token: string) => ({ authorization: `Bearer ${token}`, "content-type": "application/json" });
  const nativeToken = (response: Response) => {
    const token = response.headers.get("set-auth-token");
    expect(token).toBeTruthy();
    return token!;
  };

  beforeEach(async () => {
    await migrator.client.unsafe('truncate table public."rateLimit", public.account, public.session, public.verification, public."user", public.registration_intents, public.legal_document_versions cascade');
  });
  afterAll(async () => { await migrator.close(); });

  it("keeps a real native bearer restricted through sign-in, then requires a fresh sign-in after explicit cancellation", async () => {
    const email = `lifecycle-${crypto.randomUUID()}@example.test`;
    const signUp = await app.fetch(request("/api/auth/sign-up/email", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Lifecycle User", username: `life_${crypto.randomUUID().replaceAll("-", "").slice(0, 20)}`, email, password: "not-a-real-password" }),
    }));
    expect(signUp.status).toBe(200);
    const initialToken = nativeToken(signUp);

    const requestProof = await app.fetch(request("/api/v1/account/reauthenticate/password", {
      method: "POST", headers: bearer(initialToken), body: JSON.stringify({ action: "request_deletion", password: "not-a-real-password" }),
    }));
    expect(requestProof.status).toBe(200);
    const requestGrant = (await requestProof.json() as { grant: string }).grant;
    const deletion = await app.fetch(request("/api/v1/account/deletion/request", {
      method: "POST", headers: bearer(initialToken), body: JSON.stringify({ grant: requestGrant }),
    }));
    expect(deletion.status).toBe(200);
    await expect(deletion.json()).resolves.toMatchObject({ state: "pending_deletion", restrictedSession: true });

    const ordinary = await app.fetch(request("/api/v1/feed", { headers: { authorization: `Bearer ${initialToken}` } }));
    expect(ordinary.status).toBe(403);
    const signIn = await app.fetch(request("/api/auth/sign-in/email", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, password: "not-a-real-password" }),
    }));
    expect(signIn.status).toBe(200);
    const secondToken = nativeToken(signIn);
    const stillRestricted = await app.fetch(request("/api/v1/feed", { headers: { authorization: `Bearer ${secondToken}` } }));
    expect(stillRestricted.status).toBe(403);

    const cancelProof = await app.fetch(request("/api/v1/account/reauthenticate/password", {
      method: "POST", headers: bearer(initialToken), body: JSON.stringify({ action: "cancel_deletion", password: "not-a-real-password" }),
    }));
    expect(cancelProof.status).toBe(200);
    const cancelGrant = (await cancelProof.json() as { grant: string }).grant;
    const cancellation = await app.fetch(request("/api/v1/account/deletion/cancel", {
      method: "POST", headers: bearer(initialToken), body: JSON.stringify({ grant: cancelGrant }),
    }));
    expect(cancellation.status).toBe(200);
    await expect(cancellation.json()).resolves.toEqual({ state: "active", generation: 1, reauthenticationRequired: true });
    const revoked = await app.fetch(request("/api/auth/get-session", { headers: { authorization: `Bearer ${initialToken}` } }));
    await expect(revoked.json()).resolves.toBeNull();
  });

  it("does not create lifecycle state when the request rollout is disabled", async () => {
    const disabled = createAppForEnv({
      HYPERDRIVE: { connectionString: local(appUrl, "LIFECYCLE_AUTH_TEST_APP_DATABASE_URL", "app") },
      BETTER_AUTH_SECRET: "lifecycle-auth-test-secret-that-is-at-least-32-characters",
      BETTER_AUTH_BASE_URL: origin,
      BETTER_AUTH_TRUSTED_ORIGINS: origin,
    });
    const response = await disabled.fetch(request("/api/v1/account/deletion/request", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ grant: "a".repeat(32) }) }));
    expect(response.status).toBe(403);
    const rows = await migrator.db.select({ userId: schema.accountLifecycles.userId }).from(schema.accountLifecycles);
    expect(rows).toEqual([]);
  });
});
