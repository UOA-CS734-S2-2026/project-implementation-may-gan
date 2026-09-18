import { readFile } from "node:fs/promises";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { proveDatabaseTransactions, verifyDatabaseTransactionVisibility, createDatabase } from "./index";
import { repoPath } from "./migrations/paths";

const migratorUrl = process.env.TEST_DATABASE_URL;
const appUrl = process.env.TEST_APP_DATABASE_URL;
const enabled = Boolean(migratorUrl && appUrl);

(enabled ? describe : describe.skip)("local transaction proof", () => {
  const migrator = postgres(migratorUrl!, { max: 1, prepare: false });
  const app = postgres(appUrl!, { max: 1, prepare: false });

  beforeAll(async () => {
    await migrator.unsafe(await readFile(repoPath("packages/db/admin/bootstrap-staging-probe.sql"), "utf8"));
  });
  afterAll(async () => {
    await migrator`drop schema if exists dayli_staging_probe cascade`;
    await migrator.end({ timeout: 5 });
    await app.end({ timeout: 5 });
  });

  it("proves commit, rollback, recovery, restrictions, and cleanup", async () => {
    const group = crypto.randomUUID();
    const proof = await proveDatabaseTransactions(createDatabase(app), group);
    expect(proof).toMatchObject({ appRole: true, committed: true, rolledBack: true, updateDenied: true, ddlDenied: true });
    expect(proof.constraints).toEqual({ unique: "unique", foreign_key: "foreign_key", check: "check", not_null: "not_null" });
    await expect(verifyDatabaseTransactionVisibility(createDatabase(app), group, proof.committedRow, proof.rolledBackRow))
      .resolves.toMatchObject({ committedVisible: true, rolledBackAbsent: true, cleanup: true });
  });
});
