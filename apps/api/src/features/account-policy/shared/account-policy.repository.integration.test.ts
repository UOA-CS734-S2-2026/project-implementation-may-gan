import { createDayliDatabase, schema } from "@dayli/db";
import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { readAccountPolicy } from "./account-policy.repository";

const migratorUrl = process.env.TEST_DATABASE_URL;
const appUrl = process.env.TEST_APP_DATABASE_URL;
const enabled = Boolean(migratorUrl && appUrl);
const port = process.env.VERIFY_POSTGRES_PORT ?? "5433";

function localUrl(value: string | undefined, name: string) {
  if (!value) throw new Error(`${name} is required for account policy PostgreSQL integration tests.`);
  const url = new URL(value);
  if (url.hostname !== "localhost" || url.port !== port || url.pathname !== "/dayli_test") {
    throw new Error(`${name} must target localhost:${port}/dayli_test.`);
  }
  return value;
}

(enabled ? describe : describe.skip)("account policy PostgreSQL projection", () => {
  const migrator = createDayliDatabase(localUrl(migratorUrl, "TEST_DATABASE_URL"));
  const app = createDayliDatabase(localUrl(appUrl, "TEST_APP_DATABASE_URL"));
  const run = crypto.randomUUID();
  const userId = `account-policy-${run}`;
  const termsId = `account-policy-terms-${run}`;

  async function createUser(id = userId) {
    await migrator.db.insert(schema.user).values({
      id,
      name: "Account Policy User",
      email: `${id}@example.test`,
    });
  }

  async function setLifecycle(state: "pending_deletion" | "purging" | "purge_failed") {
    const requestedAt = new Date("2026-09-01T00:00:00.000Z");
    const cancelUntil = new Date("2026-09-08T00:00:00.000Z");
    const purgeDueAt = new Date("2026-09-15T00:00:00.000Z");
    await migrator.db.insert(schema.accountLifecycles).values({
      userId,
      state,
      requestId: `request-${state}-${run}`,
      idempotencyKeyDigest: "a".repeat(64),
      requestedAt,
      cancelUntil,
      purgeDueAt,
      purgeStartedAt: state === "pending_deletion" ? null : new Date("2026-09-08T00:00:00.000Z"),
      lastErrorCategory: state === "purge_failed" ? "transient" : null,
      nextAttemptAt: state === "purge_failed" ? new Date("2026-09-09T00:00:00.000Z") : null,
    });
  }

  afterAll(async () => {
    await migrator.db.delete(schema.user).where(eq(schema.user.id, userId));
    await migrator.db.delete(schema.legalDocumentVersions).where(eq(schema.legalDocumentVersions.id, termsId));
    await app.close();
    await migrator.close();
  });

  it("uses the restricted app role for the policy projection and keeps operator cases private", async () => {
    await createUser();
    await expect(readAccountPolicy(app.db, userId)).resolves.toMatchObject({ restriction: "active" });
    await expect(app.db.select().from(schema.operatorCases)).rejects.toThrow();
  });

  it("does not activate draft Terms, then requires the effective version for existing users", async () => {
    await migrator.db.insert(schema.legalDocumentVersions).values({
      id: termsId,
      kind: "terms",
      version: 1,
      contentDigest: "b".repeat(64),
      status: "draft",
    });
    await expect(readAccountPolicy(app.db, userId)).resolves.toMatchObject({ restriction: "active" });

    await migrator.db.update(schema.legalDocumentVersions)
      .set({ status: "effective", effectiveAt: new Date("2026-01-01T00:00:00.000Z") })
      .where(eq(schema.legalDocumentVersions.id, termsId));
    await expect(readAccountPolicy(app.db, userId)).resolves.toMatchObject({ restriction: "terms_blocked" });

    await migrator.db.insert(schema.termsAcceptances).values({ userId, termsVersionId: termsId });
    await expect(readAccountPolicy(app.db, userId)).resolves.toMatchObject({ restriction: "age_declaration_blocked" });

    await migrator.db.insert(schema.ageDeclarations).values({ userId, declarationVersion: "age-v1" });
    await expect(readAccountPolicy(app.db, userId)).resolves.toMatchObject({ restriction: "active" });
  });

  it("enforces banned and lifecycle precedence from database state", async () => {
    await setLifecycle("pending_deletion");
    await expect(readAccountPolicy(app.db, userId)).resolves.toMatchObject({ restriction: "pending_deletion" });

    await migrator.db.update(schema.user).set({ banned: true, banExpires: null }).where(eq(schema.user.id, userId));
    await expect(readAccountPolicy(app.db, userId)).resolves.toMatchObject({ restriction: "banned" });

    await migrator.db.update(schema.user).set({ banned: false }).where(eq(schema.user.id, userId));
    await migrator.db.delete(schema.accountLifecycles).where(eq(schema.accountLifecycles.userId, userId));
    await setLifecycle("purging");
    await expect(readAccountPolicy(app.db, userId)).resolves.toMatchObject({ restriction: "purging" });

    await migrator.db.delete(schema.accountLifecycles).where(eq(schema.accountLifecycles.userId, userId));
    await setLifecycle("purge_failed");
    await expect(readAccountPolicy(app.db, userId)).resolves.toMatchObject({ restriction: "purge_failed" });
  });
});
