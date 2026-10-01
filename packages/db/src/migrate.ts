import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { messagingReadinessSizeCap, requireDatabaseUrl, requireMigrationTarget, requireProductionConfirmations, sanitizeDatabaseError, validateMigrationConnectionString } from "./migrations/env";
import { assertAppliedMigrationPrefix } from "./migrations/assert-applied-prefix";
import { migrationTableExists, migrationsFolder, readAppliedMigrations, readLocalMigrations } from "./migrations/state";

const migrationLockId = 7_340_008;

async function main(): Promise<void> {
  const target = requireMigrationTarget();
  const connectionString = requireDatabaseUrl();
  validateMigrationConnectionString(connectionString, target);
  requireProductionConfirmations(target);
  const messagingReadinessCap = messagingReadinessSizeCap(target);

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
    // 0023 and 0024 read these session-scoped values under their final table
    // locks. Staging is fixed at 16 MiB. A production change is explicit and
    // retains the existing production confirmation and backup requirements.
    await client`select set_config('dayli.migration_target', ${target}, false)`;
    await client`select set_config('dayli.messaging_0023_size_cap_bytes', ${String(messagingReadinessCap)}, false)`;
    await client`select set_config('dayli.messaging_0024_size_cap_bytes', ${String(messagingReadinessCap)}, false)`;
    await client`select pg_advisory_lock(${migrationLockId})`;
    await client`set lock_timeout = '5s'`;
    await client`set statement_timeout = '5min'`;

    try {
      // The advisory lock also covers the prefix check, so a second migrator
      // cannot change history between verification and the first DDL statement.
      const applied = await migrationTableExists(client) ? await readAppliedMigrations(client) : [];
      assertAppliedMigrationPrefix(migrations, applied);
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
