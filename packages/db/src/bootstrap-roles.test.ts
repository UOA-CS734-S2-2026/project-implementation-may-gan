import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { repoPath } from "./migrations/paths";

const ownerBootstrapPath = repoPath("packages/db/admin/bootstrap-roles.sql");
const migratorBootstrapPath = repoPath("packages/db/admin/bootstrap-migrator.sql");
const verificationPath = repoPath("packages/db/admin/verify-role-bootstrap.sql");
const databaseMigrationsWorkflowPath = repoPath(".github/workflows/database-migrations.yml");
const databaseMigrationsGuidePath = repoPath("docs/dayli/database-migrations.md");

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
    expect(verification).toContain("roles_have_no_memberships");
    const executableSql = verification
      .replace(/--.*$/gm, "")
      .replace(/'(?:''|[^'])*'/g, "");
    expect(executableSql).not.toMatch(/\b(?:CREATE|ALTER|DROP|GRANT|REVOKE|INSERT|UPDATE|DELETE)\b/i);
  });

  it("requires psql for a SQL-created role's first password", async () => {
    const guide = await readFile(databaseMigrationsGuidePath, "utf8");

    expect(guide).toContain("first password for the SQL-created `migrator` role from interactive `psql`");
    expect(guide).toContain("`\\password migrator`");
    expect(guide).toContain("cannot set a password for a role that has none");
    expect(guide).toContain("`\\password app`");
    expect(guide).toContain("`\\password users_accounts_importer`");
  });

  it("stops CI when local role fixture SQL fails", async () => {
    const workflow = await readFile(databaseMigrationsWorkflowPath, "utf8");

    expect(workflow).toContain("psql -v ON_ERROR_STOP=1 -h localhost -p 5433 -U postgres -d dayli_test -f packages/db/test/init/001-local-roles.sql");
  });
});
