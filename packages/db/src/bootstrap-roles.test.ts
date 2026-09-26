import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { repoPath } from "./migrations/paths";

const ownerBootstrapPath = repoPath("packages/db/admin/bootstrap-roles.sql");
const migratorBootstrapPath = repoPath("packages/db/admin/bootstrap-migrator.sql");
const verificationPath = repoPath("packages/db/admin/verify-role-bootstrap.sql");

describe("Neon role bootstrap scripts", () => {
  it("keeps owner-only role setup separate from migrator-owned defaults", async () => {
    const ownerBootstrap = await readFile(ownerBootstrapPath, "utf8");
    const migratorBootstrap = await readFile(migratorBootstrapPath, "utf8");

    expect(ownerBootstrap).toContain("CREATE ROLE migrator LOGIN");
    expect(ownerBootstrap).toContain("REVOKE CREATE ON SCHEMA public FROM PUBLIC");
    expect(ownerBootstrap).not.toMatch(/ALTER DEFAULT PRIVILEGES/i);
    expect(ownerBootstrap).not.toMatch(/CREATE SCHEMA IF NOT EXISTS drizzle/i);

    expect(migratorBootstrap).toContain("ALTER DEFAULT PRIVILEGES IN SCHEMA public");
    expect(migratorBootstrap).not.toMatch(/ALTER DEFAULT PRIVILEGES FOR ROLE migrator/i);
    expect(migratorBootstrap).toContain("CREATE SCHEMA IF NOT EXISTS drizzle AUTHORIZATION migrator");
    expect(migratorBootstrap).toContain("GRANT SELECT, INSERT ON TABLE public.\"user\", public.account TO users_accounts_importer");
    expect(migratorBootstrap).toContain("REVOKE ALL ON SCHEMA drizzle FROM PUBLIC, app");
  });

  it("provides a read-only verification script for the restricted roles", async () => {
    const verification = await readFile(verificationPath, "utf8");

    expect(verification).toContain("roles_are_restricted");
    expect(verification).toContain("app_public_create");
    expect(verification).toContain("app_public_table_defaults");
    expect(verification).toContain("importer_target_table_rights");
    const executableSql = verification
      .replace(/--.*$/gm, "")
      .replace(/'(?:''|[^'])*'/g, "");
    expect(executableSql).not.toMatch(/\b(?:CREATE|ALTER|DROP|GRANT|REVOKE|INSERT|UPDATE|DELETE)\b/i);
  });
});
