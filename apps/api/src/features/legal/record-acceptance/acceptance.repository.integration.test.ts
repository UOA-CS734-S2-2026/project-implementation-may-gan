import { createDayliDatabase, schema } from "@dayli/db";
import { and, eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { recordExplicitLegalAcceptance } from "./acceptance.repository";
import { bindBrowserRegistrationIntent, issueRegistrationIntent, readPublishedRegistrationTerms } from "../shared/registration-intent.repository";

const migratorUrl = process.env.TEST_DATABASE_URL;
const appUrl = process.env.TEST_APP_DATABASE_URL;
const enabled = Boolean(migratorUrl && appUrl);
const port = process.env.VERIFY_POSTGRES_PORT ?? "5433";

function localUrl(value: string | undefined, name: string) {
  if (!value) throw new Error(`${name} is required for legal acceptance PostgreSQL tests.`);
  const url = new URL(value);
  if (url.hostname !== "localhost" || url.port !== port || url.pathname !== "/dayli_test") {
    throw new Error(`${name} must target localhost:${port}/dayli_test.`);
  }
  return value;
}

(enabled ? describe : describe.skip)("explicit legal acceptance with the app database role", () => {
  const migrator = createDayliDatabase(localUrl(migratorUrl, "TEST_DATABASE_URL"));
  const app = createDayliDatabase(localUrl(appUrl, "TEST_APP_DATABASE_URL"));
  const id = crypto.randomUUID();
  const userId = `legal-accept-${id}`;
  const termsId = `legal-terms-${id}`;
  const digest = "a".repeat(64);
  const input = { termsVersionId: termsId, termsContentDigest: digest, acceptedTermsAndDeclaredAge16: true as const };

  afterAll(async () => {
    await migrator.db.delete(schema.user).where(eq(schema.user.id, userId));
    await migrator.db.delete(schema.registrationIntents).where(eq(schema.registrationIntents.termsVersionId, termsId));
    await migrator.db.delete(schema.legalDocumentVersions).where(eq(schema.legalDocumentVersions.id, termsId));
    await app.close();
    await migrator.close();
  });

  it("never records acceptance for a draft or a stale version", async () => {
    await migrator.db.insert(schema.user).values({ id: userId, name: "Test Account", email: `${userId}@example.test` });
    await migrator.db.insert(schema.legalDocumentVersions).values({ id: termsId, kind: "terms", version: 1, contentDigest: digest });
    await expect(recordExplicitLegalAcceptance(app.db, userId, input)).resolves.toEqual({ status: "unavailable" });
    const draftRegistrant = `${userId}-draft`;
    await app.db.insert(schema.user).values({ id: draftRegistrant, name: "Draft User", email: `${draftRegistrant}@example.test` });
    await migrator.db.delete(schema.user).where(eq(schema.user.id, draftRegistrant));
    await migrator.db.update(schema.legalDocumentVersions)
      .set({ status: "effective", effectiveAt: new Date("2026-01-01T00:00:00Z") })
      .where(eq(schema.legalDocumentVersions.id, termsId));
    await expect(recordExplicitLegalAcceptance(app.db, userId, { ...input, termsContentDigest: "b".repeat(64) }))
      .resolves.toEqual({ status: "stale" });
    await expect(recordExplicitLegalAcceptance(app.db, userId, { ...input, termsVersionId: "another-version" }))
      .resolves.toEqual({ status: "stale" });
    expect(await app.db.select().from(schema.termsAcceptances).where(eq(schema.termsAcceptances.userId, userId))).toEqual([]);
    expect(await app.db.select().from(schema.ageDeclarations).where(eq(schema.ageDeclarations.userId, userId))).toEqual([]);
  });

  it("records two distinct server-timed facts in one transaction and replays without replacing timestamps", async () => {
    const first = await recordExplicitLegalAcceptance(app.db, userId, input);
    expect(first.status).toBe("recorded");
    if (first.status !== "recorded") throw new Error("Expected acceptance.");
    expect(first.termsVersionId).toBe(termsId);
    expect(first.acceptedAt).toBeInstanceOf(Date);
    expect(first.declaredAt).toBeInstanceOf(Date);
    await expect(recordExplicitLegalAcceptance(app.db, userId, input)).resolves.toEqual(first);
    expect(await app.db.select().from(schema.termsAcceptances).where(and(eq(schema.termsAcceptances.userId, userId), eq(schema.termsAcceptances.termsVersionId, termsId)))).toHaveLength(1);
    expect(await app.db.select().from(schema.ageDeclarations).where(eq(schema.ageDeclarations.userId, userId))).toEqual([
      expect.objectContaining({ declarationVersion: "age-16-v1" }),
    ]);
  });

  it("blocks a direct app-role user insert under effective Terms without blocking migrator fixtures", async () => {
    const blockedId = `${userId}-unproved`;
    try {
      await app.db.insert(schema.user).values({ id: blockedId, name: "Unproved User", email: `${blockedId}@example.test` });
      throw new Error("An unproved registration unexpectedly succeeded.");
    } catch (error) {
      expect((error as { cause?: { code?: string } }).cause?.code).toBe("42501");
    }
    await migrator.db.insert(schema.user).values({ id: blockedId, name: "Migrated User", email: `${blockedId}@example.test` });
    await migrator.db.delete(schema.user).where(eq(schema.user.id, blockedId));
  });

  it("consumes a proof in the same user transaction and clears the insertion bridge", async () => {
    const issued = await issueRegistrationIntent(app.db, {
      flow: "email", termsVersionId: termsId, termsContentDigest: digest, acceptedTermsAndDeclaredAge16: true,
    }, digest);
    expect(issued.status).toBe("issued");
    if (issued.status !== "issued") throw new Error("Expected an issued registration intent.");
    const registrantId = `${userId}-registered`;
    try {
      await app.db.insert(schema.user).values({
        id: registrantId, name: "Registrant", email: `${registrantId}@example.test`,
        legal_registration_admission: `email|${issued.token}|${issued.binding}`,
      });
      const [created] = await app.db.select({ admission: schema.user.legal_registration_admission })
        .from(schema.user).where(eq(schema.user.id, registrantId));
      expect(created?.admission).toBeNull();
      expect(await app.db.select().from(schema.termsAcceptances).where(eq(schema.termsAcceptances.userId, registrantId))).toHaveLength(1);
      expect(await app.db.select().from(schema.ageDeclarations).where(eq(schema.ageDeclarations.userId, registrantId))).toEqual([
        expect.objectContaining({ declarationVersion: "age-16-v1" }),
      ]);
      const replayId = `${userId}-replay`;
      await expect(app.db.insert(schema.user).values({
        id: replayId, name: "Replay", email: `${replayId}@example.test`,
        legal_registration_admission: `email|${issued.token}|${issued.binding}`,
      })).rejects.toThrow();
      expect(await app.db.select({ id: schema.user.id }).from(schema.user).where(eq(schema.user.id, replayId))).toEqual([]);
    } finally {
      await migrator.db.delete(schema.user).where(eq(schema.user.id, registrantId));
    }
  });

  it("refuses stale content and binds one browser intent to exactly one OAuth state", async () => {
    await expect(readPublishedRegistrationTerms(app.db, "b".repeat(64))).resolves.toBeNull();
    await expect(readPublishedRegistrationTerms(app.db, digest)).resolves.toEqual({ termsVersionId: termsId, termsContentDigest: digest });
    await expect(issueRegistrationIntent(app.db, { ...input, flow: "google_browser", termsContentDigest: "b".repeat(64) }, digest))
      .resolves.toEqual({ status: "stale" });
    await expect(issueRegistrationIntent(app.db, { ...input, flow: "google_browser" }, "b".repeat(64)))
      .resolves.toEqual({ status: "unavailable" });
    const issued = await issueRegistrationIntent(app.db, { ...input, flow: "google_browser" }, digest);
    expect(issued.status).toBe("issued");
    if (issued.status !== "issued") throw new Error("Expected a browser registration intent.");
    const state = `browser-state-${crypto.randomUUID()}`;
    const registrantId = `${userId}-browser`;
    expect(await bindBrowserRegistrationIntent(app.db, issued.token, "0".repeat(64), state)).toBe(false);
    expect(await bindBrowserRegistrationIntent(app.db, issued.token, issued.binding, state)).toBe(true);
    expect(await bindBrowserRegistrationIntent(app.db, issued.token, issued.binding, `${state}-other`)).toBe(false);
    await expect(app.db.insert(schema.user).values({
      id: registrantId, name: "Unbound", email: `${registrantId}@example.test`,
      legal_registration_admission: `google_browser||${state}-other`,
    })).rejects.toThrow();
    try {
      await app.db.insert(schema.user).values({
        id: registrantId, name: "Bound", email: `${registrantId}@example.test`,
        legal_registration_admission: `google_browser||${state}`,
      });
      expect(await app.db.select().from(schema.termsAcceptances).where(eq(schema.termsAcceptances.userId, registrantId))).toHaveLength(1);
      const stateDigest = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`google_browser:${state}`))),
        (byte) => byte.toString(16).padStart(2, "0")).join("");
      const [consumed] = await app.db.select({ consumedAt: schema.registrationIntents.consumedAt }).from(schema.registrationIntents)
        .where(eq(schema.registrationIntents.flowBindingDigest, stateDigest));
      expect(consumed?.consumedAt).toBeInstanceOf(Date);
    } finally {
      await migrator.db.delete(schema.user).where(eq(schema.user.id, registrantId));
    }
  });

  it("refuses a banned or pending account without changing recorded evidence", async () => {
    await migrator.db.update(schema.user).set({ banned: true }).where(eq(schema.user.id, userId));
    await expect(recordExplicitLegalAcceptance(app.db, userId, input)).resolves.toEqual({ status: "restricted" });
    await migrator.db.update(schema.user).set({ banned: false }).where(eq(schema.user.id, userId));
    await migrator.db.insert(schema.accountLifecycles).values({
      userId, state: "pending_deletion", requestId: `legal-request-${id}`,
      idempotencyKeyDigest: "f".repeat(64),
      requestedAt: new Date("2026-09-01T00:00:00Z"),
      cancelUntil: new Date("2026-09-08T00:00:00Z"),
      purgeDueAt: new Date("2026-09-15T00:00:00Z"),
    });
    await expect(recordExplicitLegalAcceptance(app.db, userId, input)).resolves.toEqual({ status: "restricted" });
  });
});
