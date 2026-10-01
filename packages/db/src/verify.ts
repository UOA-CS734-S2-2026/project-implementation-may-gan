import postgres from "postgres";
import { requireDatabaseUrl, requireMigrationTarget, sanitizeDatabaseError, validateMigrationConnectionString } from "./migrations/env";
import { assertReleaseSchemaMatches } from "./migrations/assert-release-schema";
import { migrationTableExists, readAppliedMigrations, readLocalMigrations } from "./migrations/state";

async function main(): Promise<void> {
  const target = requireMigrationTarget();
  const connectionString = requireDatabaseUrl();
  validateMigrationConnectionString(connectionString, target);

  const client = postgres(connectionString, {
    max: 1,
    prepare: false,
    idle_timeout: 5,
    connect_timeout: 10,
    onnotice: () => undefined,
  });

  try {
    await client`begin read only`;
    const localMigrations = await readLocalMigrations(process.env.MIGRATIONS_DIR);
    const hasMigrationTable = await migrationTableExists(client);
    const appliedMigrations = hasMigrationTable ? await readAppliedMigrations(client) : [];
    await client`commit`;

    assertReleaseSchemaMatches(localMigrations, appliedMigrations, target);

    console.log(`Migration verification passed for ${target}.`);
  } catch (error) {
    try {
      await client`rollback`;
    } catch {
      // The connection may already be closed or outside a transaction.
    }

    if (error instanceof Error && error.message.startsWith("Migration verification failed")) {
      throw error;
    }

    throw sanitizeDatabaseError(error);
  } finally {
    await client.end({ timeout: 5 });
  }
}

try {
  await main();
} catch (error) {
  console.error(error instanceof Error ? error.message : "Migration verification failed.");
  process.exitCode = 1;
}
