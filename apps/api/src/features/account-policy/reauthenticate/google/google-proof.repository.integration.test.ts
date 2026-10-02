import { createDayliDatabase, schema, sql } from "@dayli/db";
import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { beginGoogleManagementIntent, claimGoogleManagementIntent, completeGoogleManagementIntent, pruneExpiredGoogleManagementIntents } from "./google-proof.repository";

const enabled = Boolean(process.env.TEST_DATABASE_URL && process.env.TEST_APP_DATABASE_URL);
const port = process.env.VERIFY_POSTGRES_PORT ?? "5433";
function localUrl(value: string | undefined) {
  if (!value) throw new Error("A local PostgreSQL URL is required.");
  const url = new URL(value);
  if (url.hostname !== "localhost" || url.port !== port || url.pathname !== "/dayli_test") {
    throw new Error(`The Google proof test must use localhost:${port}/dayli_test.`);
  }
  return value;
}
const configuration = {
  clientId: "web-client-id",
  clientSecret: "test-only-google-secret-at-least-32-characters",
  redirectUri: "https://api.example.test/api/auth/callback/google",
};
const digest = async (value: string) => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))),
  (byte) => byte.toString(16).padStart(2, "0")).join("");

(enabled ? describe : describe.skip)("Google management proof with restricted PostgreSQL roles", () => {
  const migrator = createDayliDatabase(localUrl(process.env.TEST_DATABASE_URL));
  const app = createDayliDatabase(localUrl(process.env.TEST_APP_DATABASE_URL));
  const id = crypto.randomUUID();
  const userId = `google-owner-${id}`;
  const otherId = `google-other-${id}`;
  const sessionId = `google-session-${id}`;
  const otherSessionId = `google-other-session-${id}`;
  const linkedSubject = `google-subject-${id}`;

  afterAll(async () => {
    await migrator.db.delete(schema.user).where(eq(schema.user.id, userId));
    await migrator.db.delete(schema.user).where(eq(schema.user.id, otherId));
    await app.close();
    await migrator.close();
  });

  it("requires a linked subject and live original session, without direct table grants", async () => {
    await migrator.db.insert(schema.user).values([
      { id: userId, name: "Google owner", email: `${userId}@example.test` },
      { id: otherId, name: "Other owner", email: `${otherId}@example.test` },
    ]);
    await migrator.db.insert(schema.session).values([
      { id: sessionId, userId, token: `google-session-token-${id}`, expiresAt: new Date(Date.now() + 15 * 60_000) },
      { id: otherSessionId, userId: otherId, token: `google-other-token-${id}`, expiresAt: new Date(Date.now() + 15 * 60_000) },
    ]);
    expect(await beginGoogleManagementIntent(app.db, { userId, sessionId, action: "request_deletion", configuration })).toBeNull();
    await migrator.db.insert(schema.account).values({
      id: `google-account-${id}`, userId, providerId: "google", accountId: linkedSubject,
    });
    expect(await beginGoogleManagementIntent(app.db, { userId, sessionId: otherSessionId, action: "request_deletion", configuration })).toBeNull();
    const intent = await beginGoogleManagementIntent(app.db, { userId, sessionId, action: "request_deletion", configuration });
    expect(intent?.expiresAt.getTime()).toBeGreaterThan(Date.now());
    expect(intent?.url).toContain("accounts.google.com/o/oauth2/v2/auth?");
    const state = new URL(intent!.url).searchParams.get("state")!;
    const [stored] = await migrator.db.select().from(schema.accountGoogleReauthenticationIntents);
    expect(stored?.stateDigest).toBe(await digest(state));
    expect(stored?.nonceDigest).toMatch(/^[0-9a-f]{64}$/);
    expect(stored?.nonceDigest).not.toBe(new URL(intent!.url).searchParams.get("nonce"));
    await expect(app.db.select().from(schema.accountGoogleReauthenticationIntents)).rejects.toThrow();
    await expect(app.db.select().from(schema.accountManagementGrants)).rejects.toThrow();
    const [privileges] = await migrator.db.select({
      appClaim: sql<boolean>`has_function_privilege('app', 'public.claim_google_account_management_intent(text, text, text)', 'EXECUTE')`,
      workerClaim: sql<boolean>`has_function_privilege('lifecycle_worker', 'public.claim_google_account_management_intent(text, text, text)', 'EXECUTE')`,
    }).from(sql`(values (1)) as privilege_test`);
    expect(privileges).toEqual({ appClaim: true, workerClaim: false });
  });

  it("claims one intent once, then issues a one-use grant for the linked subject", async () => {
    const intent = await beginGoogleManagementIntent(app.db, { userId, sessionId, action: "request_deletion", configuration });
    const state = new URL(intent!.url).searchParams.get("state")!;
    expect(await claimGoogleManagementIntent(app.db, { state, userId, sessionId: otherSessionId })).toBeNull();
    const [first, replay] = await Promise.all([
      claimGoogleManagementIntent(app.db, { state, userId, sessionId }),
      claimGoogleManagementIntent(app.db, { state, userId, sessionId }),
    ]);
    const accepted = [first, replay].filter(Boolean);
    expect(accepted).toHaveLength(1);
    expect(accepted[0]).toMatchObject({ action: "request_deletion", linkedSubject, nonceDigest: expect.stringMatching(/^[0-9a-f]{64}$/) });
    const proof = accepted[0]!;
    expect(await completeGoogleManagementIntent(app.db, {
      userId, sessionId, action: "request_deletion", stateDigest: proof.stateDigest,
      verifiedSubject: "wrong-subject",
    })).toBeNull();
    const grant = await completeGoogleManagementIntent(app.db, {
      userId, sessionId, action: "request_deletion", stateDigest: proof.stateDigest,
      verifiedSubject: linkedSubject,
    });
    expect(grant?.token).toMatch(/^[0-9a-f]{64}$/);
    expect(grant?.expiresAt.getTime()).toBeGreaterThan(Date.now());
    expect(await completeGoogleManagementIntent(app.db, {
      userId, sessionId, action: "request_deletion", stateDigest: proof.stateDigest,
      verifiedSubject: linkedSubject,
    })).toBeNull();
    const [stored] = await migrator.db.select().from(schema.accountManagementGrants)
      .where(eq(schema.accountManagementGrants.userId, userId));
    expect(stored?.googleSubjectDigest).toBe(await digest(linkedSubject));
    expect(stored?.credentialHashDigest).toBeNull();
    const consume = async () => (await app.db.select({ accepted: sql<boolean>`public.consume_account_management_grant(
      ${userId}, ${sessionId}, 'request_deletion'::public.account_management_grant_action, ${await digest(grant!.token)}
    )` }).from(sql`(values (1)) as grant_request`))[0]?.accepted;
    const [used, reused] = await Promise.all([consume(), consume()]);
    expect([used, reused].sort()).toEqual([false, true]);
    expect(await consume()).toBe(false);

    const secondIntent = await beginGoogleManagementIntent(app.db, { userId, sessionId, action: "request_deletion", configuration });
    const secondProof = await claimGoogleManagementIntent(app.db, { state: new URL(secondIntent!.url).searchParams.get("state")!, userId, sessionId });
    const unused = await completeGoogleManagementIntent(app.db, {
      userId, sessionId, action: "request_deletion", stateDigest: secondProof!.stateDigest, verifiedSubject: linkedSubject,
    });
    await migrator.db.delete(schema.account).where(eq(schema.account.id, `google-account-${id}`));
    const [unlinked] = await app.db.select({ accepted: sql<boolean>`public.consume_account_management_grant(
      ${userId}, ${sessionId}, 'request_deletion'::public.account_management_grant_action, ${await digest(unused!.token)}
    )` }).from(sql`(values (1)) as grant_request`);
    expect(unlinked?.accepted).toBe(false);
    await migrator.db.insert(schema.account).values({
      id: `google-account-${id}`, userId, providerId: "google", accountId: linkedSubject,
    });
  });

  it("fences lifecycle generation changes, cancellation deadline, and subject removal", async () => {
    const intent = await beginGoogleManagementIntent(app.db, { userId, sessionId, action: "request_deletion", configuration });
    const state = new URL(intent!.url).searchParams.get("state")!;
    const requestedAt = new Date();
    await migrator.db.insert(schema.accountLifecycles).values({
      userId, state: "pending_deletion", requestId: `google-request-${id}`,
      idempotencyKeyDigest: "e".repeat(64), generation: 1, requestedAt,
      cancelUntil: new Date(requestedAt.getTime() + 168 * 60 * 60_000),
      purgeDueAt: new Date(requestedAt.getTime() + 336 * 60 * 60_000),
    });
    expect(await claimGoogleManagementIntent(app.db, { state, userId, sessionId })).toBeNull();
    expect(await beginGoogleManagementIntent(app.db, { userId, sessionId, action: "request_deletion", configuration })).toBeNull();
    const cancellation = await beginGoogleManagementIntent(app.db, { userId, sessionId, action: "cancel_deletion", configuration });
    expect(cancellation).not.toBeNull();
    const cancelState = new URL(cancellation!.url).searchParams.get("state")!;
    const proof = await claimGoogleManagementIntent(app.db, { state: cancelState, userId, sessionId });
    expect(proof?.action).toBe("cancel_deletion");
    await migrator.db.delete(schema.account).where(eq(schema.account.id, `google-account-${id}`));
    expect(await completeGoogleManagementIntent(app.db, {
      userId, sessionId, action: "cancel_deletion", stateDigest: proof!.stateDigest, verifiedSubject: linkedSubject,
    })).toBeNull();
  });

  it("prunes bounded expired intents without granting access to the app role", async () => {
    const first = await beginGoogleManagementIntent(app.db, { userId, sessionId, action: "cancel_deletion", configuration });
    expect(first).toBeNull();
    await migrator.db.update(schema.accountGoogleReauthenticationIntents).set({
      createdAt: new Date(Date.now() - 10_000), expiresAt: new Date(Date.now() - 1_000),
    });
    expect(await pruneExpiredGoogleManagementIntents(app.db)).toBeGreaterThan(0);
    expect(await migrator.db.select().from(schema.accountGoogleReauthenticationIntents)).toEqual([]);
  });
});
