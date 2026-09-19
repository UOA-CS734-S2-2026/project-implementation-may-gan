import { describe, expect, it } from "vitest";
import {
  accountColumnContract,
  fixtureUserIds,
  importedAccountColumns,
  isUsersAccountsImportApplyRequested,
  requireUsersAccountsImportConnections,
  sanitizeUsersAccountsImportError,
  userColumnContract,
  validateUsersAccountsImportSourceConnectionString,
  validateUsersAccountsImportTargetConnectionString,
} from "./users-import-policy";

describe("users and accounts import policy", () => {
  it("uses the exact fixture IDs, full target shapes, and a narrow safe account copy contract", () => {
    expect(fixtureUserIds).toEqual(["seed_user_alice", "seed_user_bob", "seed_user_carol"]);
    expect(userColumnContract).toHaveLength(19);
    expect(accountColumnContract.map((column) => column.name)).toContain("access_token");
    expect(importedAccountColumns).toEqual(["id", "account_id", "provider_id", "user_id", "password", "created_at", "updated_at"]);
  });

  it("requires separate source and restricted target variables", () => {
    expect(() => requireUsersAccountsImportConnections({})).toThrow("LEGACY_SUPABASE_USERS_ACCOUNTS_READONLY_DATABASE_URL is required.");
    expect(() => requireUsersAccountsImportConnections({ LEGACY_SUPABASE_USERS_ACCOUNTS_READONLY_DATABASE_URL: "postgresql://source" })).toThrow("NEON_USERS_ACCOUNTS_IMPORT_DATABASE_URL is required.");
  });

  it("accepts only TLS Supabase source and direct restricted Neon target URLs", () => {
    expect(() => validateUsersAccountsImportSourceConnectionString("postgresql://reader:secret@db.example.supabase.co/postgres?sslmode=verify-full")).not.toThrow();
    expect(() => validateUsersAccountsImportTargetConnectionString("postgresql://users_accounts_importer:secret@example.us-east-1.aws.neon.tech/dayli?sslmode=require")).not.toThrow();
    expect(() => validateUsersAccountsImportTargetConnectionString("postgresql://migrator:secret@example.us-east-1.aws.neon.tech/dayli?sslmode=require")).toThrow("Users and accounts import target connection must use the users_accounts_importer role.");
    expect(() => validateUsersAccountsImportTargetConnectionString("postgresql://users_accounts_importer:secret@example-pooler.us-east-1.aws.neon.tech/dayli?sslmode=require")).toThrow("Users and accounts import target must use an unpooled Neon connection.");
  });

  it("defaults to dry run and requires exact apply confirmation", () => {
    expect(isUsersAccountsImportApplyRequested([], {})).toBe(false);
    expect(() => isUsersAccountsImportApplyRequested(["--apply"], {})).toThrow('Applying users and accounts import requires APPLY_USERS_ACCOUNTS_IMPORT="IMPORT users and accounts".');
    expect(isUsersAccountsImportApplyRequested(["--apply"], { APPLY_USERS_ACCOUNTS_IMPORT: "IMPORT users and accounts" })).toBe(true);
  });

  it("sanitizes database failures", () => {
    expect(sanitizeUsersAccountsImportError({ code: "57014", message: "postgresql://secret" }).message).toBe("Users and accounts import could not obtain a safe transaction. Stop and retry only after the source and target are idle.");
    expect(sanitizeUsersAccountsImportError(new Error("password=secret")).message).toBe("Users and accounts import failed. Review protected migration evidence without exposing row data, credentials, hashes, or tokens.");
  });
});
