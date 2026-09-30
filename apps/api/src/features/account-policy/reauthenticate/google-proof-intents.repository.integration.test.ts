import { createDayliDatabase, schema } from "@dayli/db";
import { afterAll, afterEach, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { createGoogleProofIntentStore } from "./google-proof-intents.repository";
import { digestGoogleProofSecret } from "./google-proof-crypto";

const migratorUrl = process.env.TEST_DATABASE_URL;
const appUrl = process.env.TEST_APP_DATABASE_URL;
const required = process.env.POSTGRES_INTEGRATION_REQUIRED === "1";
const configured = Boolean(migratorUrl && appUrl);
const port = process.env.VERIFY_POSTGRES_PORT ?? "5433";
const key = { version: "test-subject-v1", material: "MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY" };
const cryptoKeys = { encryption: { version: "test-encryption-v1", material: "YWJjZGVmMDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODk" }, subjectHmac: key };

function requireLocal(value: string | undefined, name: string): string {
  if (!value) throw new Error(`${name} is required for Google proof PostgreSQL integration tests.`);
  const url = new URL(value);
  if (url.hostname !== "localhost" || url.port !== port || url.pathname !== "/dayli_test") throw new Error(`${name} must target localhost:${port}/dayli_test.`);
  return value;
}

if (required && !configured) throw new Error("TEST_DATABASE_URL and TEST_APP_DATABASE_URL are required for mandatory Google proof PostgreSQL integration tests.");

(configured ? describe : describe.skip)("Google proof intent PostgreSQL repository", () => {
  const migrator = createDayliDatabase(requireLocal(migratorUrl, "TEST_DATABASE_URL"));
  const app = createDayliDatabase(requireLocal(appUrl, "TEST_APP_DATABASE_URL"));
  const userIds: string[] = [];

  async function fixture(subject?: string) {
    const suffix = crypto.randomUUID();
    subject ??= `google-subject-a-${suffix}`;
    const userId = `google-proof-user-${suffix}`;
    const sessionId = `google-proof-session-${suffix}`;
    userIds.push(userId);
    await migrator.db.insert(schema.user).values({ id: userId, name: "Google Proof Fixture", email: `${userId}@example.test` });
    await migrator.db.insert(schema.session).values({ id: sessionId, userId, token: `token-${suffix}`, expiresAt: new Date(Date.now() + 60 * 60 * 1000) });
    await migrator.db.insert(schema.account).values({ id: `google-proof-account-${suffix}`, userId, providerId: "google", accountId: subject });
    await migrator.db.insert(schema.accountLifecycles).values({ userId });
    return { userId, sessionId, subject };
  }

  async function input(actor: { userId: string; sessionId: string }, action: "request_deletion" | "cancel_deletion" = "request_deletion", generation = 0) {
    return {
      stateDigest: await digestGoogleProofSecret(`state-${crypto.randomUUID()}`),
      nonceDigest: await digestGoogleProofSecret(`nonce-${crypto.randomUUID()}`),
      verifierCiphertext: "ciphertext",
      verifierKeyVersion: "test-encryption-v1",
      session: actor,
      action,
      lifecycleGeneration: generation,
    };
  }

  async function setPending(userId: string, generation = 0) {
    const requestedAt = new Date();
    await migrator.db.update(schema.accountLifecycles).set({
      state: "pending_deletion",
      generation,
      requestId: `request-${crypto.randomUUID()}`,
      idempotencyKeyDigest: "a".repeat(64),
      requestedAt,
      cancelUntil: new Date(requestedAt.getTime() + 168 * 60 * 60 * 1000),
      purgeDueAt: new Date(requestedAt.getTime() + 336 * 60 * 60 * 1000),
    }).where(eq(schema.accountLifecycles.userId, userId));
  }

  afterEach(async () => {
    while (userIds.length) {
      const userId = userIds.pop()!;
      await migrator.db.delete(schema.user).where(eq(schema.user.id, userId));
    }
  });
  afterAll(async () => { await app.close(); await migrator.close(); });

  it("creates, claims, verifies the current linked subject, consumes once, and stores only a grant hash", async () => {
    const actor = await fixture();
    const store = createGoogleProofIntentStore(app.db, cryptoKeys);
    const intent = await input(actor);
    expect(await store.create(intent)).toBe(true);
    const claimed = await store.claim(intent.stateDigest);
    expect(claimed).toMatchObject({ verifierCiphertext: "ciphertext", userId: actor.userId });
    expect(await store.recordVerifiedProof(intent.stateDigest, actor, claimed!.claimToken, actor.subject)).toBe(true);
    const completed = await store.complete(intent.stateDigest, actor, "request_deletion");
    expect(completed?.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(await store.complete(intent.stateDigest, actor, "request_deletion")).toBeNull();

    const [intentRow] = await migrator.db.select().from(schema.accountGoogleReauthenticationIntents).where(eq(schema.accountGoogleReauthenticationIntents.stateDigest, intent.stateDigest));
    const [grant] = await migrator.db.select().from(schema.accountManagementGrants).where(eq(schema.accountManagementGrants.userId, actor.userId));
    expect(intentRow).toMatchObject({ status: "consumed", verifierCiphertext: null, verifierKeyVersion: null, callbackClaimDigest: null });
    expect(grant).toMatchObject({ action: "request_deletion", lifecycleGeneration: 0 });
    expect(grant?.tokenDigest).toMatch(/^[0-9a-f]{64}$/);
    expect(grant?.tokenDigest).not.toBe(completed?.token);
    expect(grant?.expiresAt.getTime()).toBeGreaterThan(Date.now() + 9 * 60 * 1000);
  });

  it("admits one callback claimant and one concurrent completion", async () => {
    const actor = await fixture();
    const intent = await input(actor);
    const store = createGoogleProofIntentStore(app.db, cryptoKeys);
    expect(await store.create(intent)).toBe(true);
    const claims = await Promise.all([store.claim(intent.stateDigest), store.claim(intent.stateDigest)]);
    expect(claims.filter(Boolean)).toHaveLength(1);
    const claim = claims.find(Boolean)!;
    expect(await store.recordVerifiedProof(intent.stateDigest, actor, claim.claimToken, actor.subject)).toBe(true);

    const secondApp = createDayliDatabase(requireLocal(appUrl, "TEST_APP_DATABASE_URL"));
    try {
      const results = await Promise.all([
        store.complete(intent.stateDigest, actor, "request_deletion"),
        createGoogleProofIntentStore(secondApp.db, cryptoKeys).complete(intent.stateDigest, actor, "request_deletion"),
      ]);
      expect(results.filter(Boolean)).toHaveLength(1);
      const grants = await migrator.db.select().from(schema.accountManagementGrants).where(eq(schema.accountManagementGrants.userId, actor.userId));
      expect(grants).toHaveLength(1);
    } finally { await secondApp.close(); }
  });

  it("requires the active claimant token, rejects a stale lease, and permits a new claimant after lease recovery", async () => {
    const actor = await fixture();
    const intent = await input(actor);
    const store = createGoogleProofIntentStore(app.db, cryptoKeys);
    expect(await store.create(intent)).toBe(true);
    const first = await store.claim(intent.stateDigest);
    expect(await store.fail(intent.stateDigest, "x".repeat(43))).toBe(false);
    const [row] = await migrator.db.select().from(schema.accountGoogleReauthenticationIntents).where(eq(schema.accountGoogleReauthenticationIntents.stateDigest, intent.stateDigest));
    expect(row?.status).toBe("claimed");
    await migrator.db.update(schema.accountGoogleReauthenticationIntents).set({ callbackClaimedAt: new Date(Date.now() - 2000), callbackLeaseExpiresAt: new Date(Date.now() - 1000) }).where(eq(schema.accountGoogleReauthenticationIntents.stateDigest, intent.stateDigest));
    expect(await store.recordVerifiedProof(intent.stateDigest, actor, first!.claimToken, actor.subject)).toBe(false);
    const recovered = await store.claim(intent.stateDigest);
    expect(recovered?.claimToken).not.toBe(first?.claimToken);
    expect(await store.fail(intent.stateDigest, first!.claimToken)).toBe(false);
    expect(await store.recordVerifiedProof(intent.stateDigest, actor, recovered!.claimToken, actor.subject)).toBe(true);
  });

  it("never accepts a verified provider subject that differs from the current linked account, or a changed mapping after proof", async () => {
    const actor = await fixture("linked-subject-a");
    const store = createGoogleProofIntentStore(app.db, cryptoKeys);
    const wrongSubject = await input(actor);
    expect(await store.create(wrongSubject)).toBe(true);
    const wrongClaim = await store.claim(wrongSubject.stateDigest);
    expect(await store.recordVerifiedProof(wrongSubject.stateDigest, actor, wrongClaim!.claimToken, "provider-subject-b")).toBe(false);

    const changed = await input(actor);
    expect(await store.create(changed)).toBe(true);
    const changedClaim = await store.claim(changed.stateDigest);
    expect(await store.recordVerifiedProof(changed.stateDigest, actor, changedClaim!.claimToken, actor.subject)).toBe(true);
    await migrator.db.update(schema.account).set({ accountId: "linked-subject-replaced" }).where(and(eq(schema.account.userId, actor.userId), eq(schema.account.providerId, "google")));
    expect(await store.complete(changed.stateDigest, actor, "request_deletion")).toBeNull();

    const unlinkedActor = await fixture();
    const unlinked = await input(unlinkedActor);
    expect(await store.create(unlinked)).toBe(true);
    const unlinkedClaim = await store.claim(unlinked.stateDigest);
    expect(await store.recordVerifiedProof(unlinked.stateDigest, unlinkedActor, unlinkedClaim!.claimToken, unlinkedActor.subject)).toBe(true);
    await migrator.db.delete(schema.account).where(and(eq(schema.account.userId, unlinkedActor.userId), eq(schema.account.providerId, "google")));
    expect(await store.complete(unlinked.stateDigest, unlinkedActor, "request_deletion")).toBeNull();
  });

  it("checks live actor, action, expiry, lifecycle generation, and current lifecycle state at every state change", async () => {
    const actor = await fixture();
    const store = createGoogleProofIntentStore(app.db, cryptoKeys);
    expect(await store.create(await input({ ...actor, sessionId: "wrong-session" }))).toBe(false);
    await migrator.db.update(schema.session).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(schema.session.id, actor.sessionId));
    expect(await store.create(await input(actor))).toBe(false);
    await migrator.db.update(schema.session).set({ expiresAt: new Date(Date.now() + 60 * 60 * 1000) }).where(eq(schema.session.id, actor.sessionId));

    const expired = await input(actor);
    expect(await store.create(expired)).toBe(true);
    await migrator.db.update(schema.accountGoogleReauthenticationIntents).set({ createdAt: new Date(Date.now() - 20 * 60 * 1000), expiresAt: new Date(Date.now() - 1000) }).where(eq(schema.accountGoogleReauthenticationIntents.stateDigest, expired.stateDigest));
    expect(await store.claim(expired.stateDigest)).toBeNull();

    const generationChanged = await input(actor);
    expect(await store.create(generationChanged)).toBe(true);
    const generationClaim = await store.claim(generationChanged.stateDigest);
    expect(await store.recordVerifiedProof(generationChanged.stateDigest, actor, generationClaim!.claimToken, actor.subject)).toBe(true);
    await migrator.db.update(schema.accountLifecycles).set({ generation: 1 }).where(eq(schema.accountLifecycles.userId, actor.userId));
    expect(await store.complete(generationChanged.stateDigest, actor, "request_deletion")).toBeNull();

    const pendingActor = await fixture();
    await setPending(pendingActor.userId);
    expect(await store.create(await input(pendingActor, "request_deletion"))).toBe(false);
    const cancel = await input(pendingActor, "cancel_deletion");
    expect(await store.create(cancel)).toBe(true);
    const cancelClaim = await store.claim(cancel.stateDigest);
    expect(await store.recordVerifiedProof(cancel.stateDigest, pendingActor, cancelClaim!.claimToken, pendingActor.subject)).toBe(true);
    await migrator.db.update(schema.accountLifecycles).set({ state: "active", requestId: null, idempotencyKeyDigest: null, requestedAt: null, cancelUntil: null, purgeDueAt: null }).where(eq(schema.accountLifecycles.userId, pendingActor.userId));
    expect(await store.complete(cancel.stateDigest, pendingActor, "cancel_deletion")).toBeNull();
  });

  it("clears terminal verifier material and rejects failed or replayed proof completion", async () => {
    const actor = await fixture();
    const store = createGoogleProofIntentStore(app.db, cryptoKeys);
    const intent = await input(actor);
    expect(await store.create(intent)).toBe(true);
    const claimed = await store.claim(intent.stateDigest);
    expect(await store.fail(intent.stateDigest, claimed!.claimToken)).toBe(true);
    expect(await store.recordVerifiedProof(intent.stateDigest, actor, claimed!.claimToken, actor.subject)).toBe(false);
    expect(await store.complete(intent.stateDigest, actor, "request_deletion")).toBeNull();
    const [row] = await migrator.db.select().from(schema.accountGoogleReauthenticationIntents).where(eq(schema.accountGoogleReauthenticationIntents.stateDigest, intent.stateDigest));
    expect(row).toMatchObject({ status: "failed", verifierCiphertext: null, verifierKeyVersion: null, callbackClaimDigest: null });
  });
});
