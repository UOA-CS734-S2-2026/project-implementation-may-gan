import { appendFile } from "node:fs/promises";
import postgres from "postgres";
import { requireDatabaseUrl, requireMigrationTarget, sanitizeDatabaseError, validateMigrationConnectionString } from "./migrations/env";
import { pendingMigrations } from "./migrations/pending";
import { migrationTableExists, readAppliedMigrations, readLocalMigrations } from "./migrations/state";

async function writePlanOutput(hasPending: boolean): Promise<void> {
  const output = process.env.GITHUB_OUTPUT;
  if (output) {
    await appendFile(output, `pending=${hasPending}\n`);
  }
}

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
    const local = await readLocalMigrations();
    await client`begin read only`;
    const applied = await migrationTableExists(client) ? await readAppliedMigrations(client) : [];
    await client`commit`;
    const pending = pendingMigrations(local, applied);
    await writePlanOutput(pending.length > 0);
    console.log(`Pending reviewed migrations for ${target}: ${pending.map(({ tag }) => tag).join(", ") || "none"}.`);
  } catch (error) {
    try {
      await client`rollback`;
    } catch {
      // The connection may already be closed or outside a transaction.
    }
    throw sanitizeDatabaseError(error);
  } finally {
    await client.end({ timeout: 5 });
  }
}

try {
  await main();
} catch (error) {
  console.error(error instanceof Error ? error.message : "Migration planning failed.");
  process.exitCode = 1;
}
