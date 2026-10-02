import { createDayliDatabase, schema } from "@dayli/db";
import { and, eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { recordExplicitLegalAcceptance } from "./acceptance.repository";

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
