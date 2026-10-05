import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { repoPath } from "./migrations/paths";

const ownerBootstrapPath = repoPath("packages/db/admin/bootstrap-roles.sql");
const migratorBootstrapPath = repoPath("packages/db/admin/bootstrap-migrator.sql");
const developmentBootstrapPath = repoPath("packages/db/dev/init/001-development-roles.sh");
const verificationPath = repoPath("packages/db/admin/verify-role-bootstrap.sql");
const databaseMigrationsWorkflowPath = repoPath(".github/workflows/database-migrations.yml");
const databaseMigrationsGuidePath = repoPath("docs/dayli/database-migrations.md");

describe("Neon role bootstrap scripts", () => {
  it("keeps owner-only role setup separate from migrator-owned defaults", async () => {
    const ownerBootstrap = await readFile(ownerBootstrapPath, "utf8");
    const migratorBootstrap = await readFile(migratorBootstrapPath, "utf8");

    expect(ownerBootstrap).toContain("CREATE ROLE migrator LOGIN");
    expect(ownerBootstrap).toContain("CREATE ROLE app LOGIN");
    expect(ownerBootstrap).toContain("CREATE ROLE lifecycle_worker LOGIN");
    expect(ownerBootstrap).toContain("GRANT CONNECT ON DATABASE %I TO migrator, app, lifecycle_worker");
    expect(ownerBootstrap).not.toContain("users_accounts_importer");
    const developmentBootstrap = await readFile(developmentBootstrapPath, "utf8");
    expect(developmentBootstrap).not.toContain("users_accounts_importer");
    expect(ownerBootstrap).toContain("REVOKE CREATE ON SCHEMA public FROM PUBLIC");
    expect(ownerBootstrap).not.toMatch(/ALTER DEFAULT PRIVILEGES/i);
    expect(ownerBootstrap).not.toMatch(/CREATE SCHEMA IF NOT EXISTS drizzle/i);

    expect(migratorBootstrap).toContain("ALTER DEFAULT PRIVILEGES IN SCHEMA public");
    expect(migratorBootstrap).not.toMatch(/ALTER DEFAULT PRIVILEGES FOR ROLE migrator/i);
    expect(migratorBootstrap).toContain("CREATE SCHEMA IF NOT EXISTS drizzle AUTHORIZATION migrator");
    expect(migratorBootstrap).toContain("REVOKE ALL ON SCHEMA drizzle FROM PUBLIC, app");
    expect(migratorBootstrap).toContain("REVOKE DELETE ON TABLE public.\"user\" FROM app");
    expect(migratorBootstrap).toContain("REVOKE ALL ON TABLE public.%I FROM app, lifecycle_worker");
    expect(migratorBootstrap).toContain("'data_export_requests'");
    expect(migratorBootstrap).toContain("'data_export_object_cleanup_tasks'");
    expect(migratorBootstrap).toContain("'data_export_cleanup_incidents'");
    expect(migratorBootstrap).toContain("'account_purge_operator_control'");
    expect(migratorBootstrap).not.toContain("GRANT SELECT, INSERT, UPDATE ON TABLE public.data_export_requests TO app");
    expect(migratorBootstrap).toContain("'account_notification_preferences'");
    expect(migratorBootstrap).toContain("'notification_deliveries'");
    expect(migratorBootstrap).toContain("'notification_events'");
    expect(migratorBootstrap).toContain("GRANT SELECT, INSERT, UPDATE ON TABLE public.account_notification_preferences TO app");
  });

  it("provides a read-only verification script for the restricted roles", async () => {
    const verification = await readFile(verificationPath, "utf8");

    expect(verification).toContain("roles_are_restricted");
    expect(verification).toContain("app_public_create");
    expect(verification).toContain("app_public_table_defaults");
    expect(verification).toContain("lifecycle_worker_public_usage");
    expect(verification).toContain("lifecycle_worker_cannot_use_drizzle");
    expect(verification).toContain("roles_have_no_memberships");
    expect(verification).toContain("export_operations_private");
    expect(verification).toContain("account_purge_operator_control");
    const executableSql = verification
      .replace(/--.*$/gm, "")
      .replace(/'(?:''|[^'])*'/g, "");
    expect(executableSql).not.toMatch(/\b(?:CREATE|ALTER|DROP|GRANT|REVOKE|INSERT|UPDATE|DELETE)\b/i);
  });

  it("documents SQL-created restricted roles without publishing credentials", async () => {
    const guide = await readFile(databaseMigrationsGuidePath, "utf8");

    expect(guide).toContain("CREATE ROLE migrator WITH LOGIN PASSWORD '<unique migrator password>'");
    expect(guide).toContain("CREATE ROLE app WITH LOGIN PASSWORD '<different app password>'");
    expect(guide).toContain("Never use the Console's Create role action");
    expect(guide).toContain("Neon rejected `psql`'s `\\password`");
    expect(guide).not.toContain("Run `\\password migrator`");
  });

  it("stops CI when local role fixture SQL fails", async () => {
    const workflow = await readFile(databaseMigrationsWorkflowPath, "utf8");

    expect(workflow).toContain("psql -v ON_ERROR_STOP=1 -h localhost -p 5433 -U postgres -d dayli_test -f packages/db/test/init/001-local-roles.sql");
  });
});
