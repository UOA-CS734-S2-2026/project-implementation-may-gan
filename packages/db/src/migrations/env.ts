import { URL } from "node:url";

export type MigrationTarget = "local" | "staging" | "production";

const targets = new Set<MigrationTarget>(["local", "staging", "production"]);

export function requireMigrationTarget(): MigrationTarget {
  const value = process.env.MIGRATION_TARGET;

  if (!targets.has(value as MigrationTarget)) {
    throw new Error("MIGRATION_TARGET must be one of: local, staging, production.");
  }

  return value as MigrationTarget;
}

export function requireDatabaseUrl(variableName = "DATABASE_URL"): string {
  const value = process.env[variableName];

  if (!value || value.trim().length === 0) {
    throw new Error(`${variableName} is required.`);
  }

  return value;
}

export function validateMigrationConnectionString(connectionString: string, target: MigrationTarget): void {
  let parsed: URL;

  try {
    parsed = new URL(connectionString);
  } catch {
    throw new Error("Database connection string is invalid.");
  }

  if (!["postgres:", "postgresql:"].includes(parsed.protocol)) {
    throw new Error("Database connection string must use PostgreSQL.");
  }

  if (parsed.username !== "migrator") {
    throw new Error("Migration connection string must use the migrator role.");
  }

  if (target === "local") {
    if (parsed.hostname !== "localhost" || parsed.port !== "5433" || parsed.pathname !== "/dayli_test") {
      throw new Error("Local migrations must target localhost:5433/dayli_test.");
    }

    return;
  }

  if (!parsed.hostname.endsWith(".neon.tech")) {
    throw new Error("Staging and production migrations must target a Neon host.");
  }

  if (parsed.hostname.includes("-pooler")) {
    throw new Error("Migrations must use an unpooled Neon connection.");
  }

  const sslMode = parsed.searchParams.get("sslmode");
  if (!sslMode || !["require", "verify-ca", "verify-full"].includes(sslMode)) {
    throw new Error("Neon migrations require sslmode=require or stricter.");
  }
}

export function requireProductionConfirmations(target: MigrationTarget): void {
  if (target !== "production") {
    return;
  }

  if (process.env.CONFIRM_PRODUCTION_MIGRATION !== "MIGRATE production") {
    throw new Error('Production requires CONFIRM_PRODUCTION_MIGRATION="MIGRATE production".');
  }

  if (process.env.CONFIRM_NEON_BACKUP_CHECKED !== "true") {
    throw new Error("Production requires CONFIRM_NEON_BACKUP_CHECKED=true.");
  }
}

export function sanitizeDatabaseError(error: unknown): Error {
  if (error instanceof Error) {
    if (process.env.MIGRATION_TARGET === "local" && process.env.DEBUG_DATABASE_ERRORS === "1") {
      return new Error(`Database operation failed: ${error.message}`);
    }

    return new Error(`Database operation failed: ${error.name}`);
  }

  return new Error("Database operation failed.");
}
