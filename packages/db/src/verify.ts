import postgres from "postgres";
import { requireDatabaseUrl, requireMigrationTarget, sanitizeDatabaseError, validateMigrationConnectionString } from "./migrations/env";
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
    const localMigrations = await readLocalMigrations();
    const hasMigrationTable = await migrationTableExists(client);
    const appliedMigrations = hasMigrationTable ? await readAppliedMigrations(client) : [];
    await client`commit`;

    const failures: string[] = [];

    if (appliedMigrations.length < localMigrations.length) {
      failures.push("pending local migrations exist");
    }

    if (appliedMigrations.length > localMigrations.length) {
      failures.push("database contains migration records unknown to this checkout");
    }

    const comparedCount = Math.min(appliedMigrations.length, localMigrations.length);
    for (let index = 0; index < comparedCount; index += 1) {
      if (appliedMigrations[index]?.hash !== localMigrations[index]?.hash) {
        failures.push(`applied migration hash mismatch at position ${index}`);
      }
    }

    if (failures.length > 0) {
      throw new Error(`Migration verification failed: ${failures.join("; ")}.`);
    }

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
