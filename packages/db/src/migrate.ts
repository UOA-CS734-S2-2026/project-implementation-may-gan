import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { requireDatabaseUrl, requireMigrationTarget, requireProductionConfirmations, sanitizeDatabaseError, validateMigrationConnectionString } from "./migrations/env";
import { migrationsFolder, readLocalMigrations } from "./migrations/state";

const migrationLockId = 7_340_008;

async function main(): Promise<void> {
  const target = requireMigrationTarget();
  const connectionString = requireDatabaseUrl();
  validateMigrationConnectionString(connectionString, target);
  requireProductionConfirmations(target);

  const client = postgres(connectionString, {
    max: 1,
    prepare: false,
    idle_timeout: 5,
    connect_timeout: 10,
    onnotice: () => undefined,
  });

  try {
    const migrations = await readLocalMigrations();
    await client`set statement_timeout = '30s'`;
    await client`select pg_advisory_lock(${migrationLockId})`;
    await client`set lock_timeout = '5s'`;
    await client`set statement_timeout = '5min'`;

    try {
      await migrate(drizzle(client), {
        migrationsFolder,
        migrationsSchema: "drizzle",
        migrationsTable: "__drizzle_migrations",
      });
    } finally {
      await client`select pg_advisory_unlock(${migrationLockId})`;
    }

    console.log(`Applied pending migrations for ${target}.`);
    console.log(`Known migrations: ${migrations.map((migration) => migration.tag).join(", ") || "none"}.`);
  } catch (error) {
    throw sanitizeDatabaseError(error);
  } finally {
    await client.end({ timeout: 5 });
  }
}

try {
  await main();
} catch (error) {
  console.error(error instanceof Error ? error.message : "Migration failed.");
  process.exitCode = 1;
}
