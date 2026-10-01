#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";

export const messagingReadinessMigration = "0023_polite_sway";
export const messagingTables = [
  "conversations",
  "conversation_members",
  "messages",
  "message_reactions",
  "conversation_changes",
];
export const messagingSizeCapBytes = 16 * 1024 * 1024;

function fail(message) {
  throw new Error(`Staging messaging readiness preflight failed: ${message}`);
}

function required(environment, name) {
  const value = environment[name];
  if (!value) fail(`${name} is required.`);
  return value;
}

function migrationDirectory(environment) {
  return environment.MIGRATIONS_DIR || path.resolve("packages/db/migrations");
}

function validateEnvironment(environment) {
  if (environment.MIGRATION_TARGET !== "staging") fail("MIGRATION_TARGET must be staging.");
  let databaseUrl;
  try {
    databaseUrl = new URL(required(environment, "DATABASE_URL"));
  } catch {
    fail("DATABASE_URL is invalid.");
  }
  if (!['postgres:', 'postgresql:'].includes(databaseUrl.protocol) || databaseUrl.username !== "migrator") {
    fail("DATABASE_URL must use the direct migrator role.");
  }
  if (!databaseUrl.hostname.endsWith(".neon.tech") || databaseUrl.hostname.includes("-pooler")) {
    fail("DATABASE_URL must use a direct Neon host.");
  }
  if (!["require", "verify-ca", "verify-full"].includes(databaseUrl.searchParams.get("sslmode"))) {
    fail("DATABASE_URL must require TLS.");
  }
  return databaseUrl.toString();
}

export async function readMigrationState(directory, readFileImpl = readFile) {
  let journal;
  try {
    journal = JSON.parse(await readFileImpl(path.join(directory, "meta", "_journal.json"), "utf8"));
  } catch {
    fail("the captured migration journal is unavailable.");
  }
  if (!Array.isArray(journal.entries) || journal.entries.some((entry) => typeof entry?.tag !== "string")) {
    fail("the captured migration journal is invalid.");
  }

  const migrations = [];
  for (const { tag } of journal.entries) {
    try {
      const body = await readFileImpl(path.join(directory, `${tag}.sql`));
      migrations.push({ tag, hash: createHash("sha256").update(body).digest("hex") });
    } catch {
      fail("a captured migration file is unavailable.");
    }
  }
  if (!migrations.some(({ tag }) => tag === messagingReadinessMigration)) {
    fail(`${messagingReadinessMigration} is absent from the captured migration state.`);
  }
  return migrations;
}

export function pendingMigrationTags(migrations, appliedHashes) {
  if (!Array.isArray(appliedHashes) || appliedHashes.some((hash) => typeof hash !== "string")) {
    fail("the applied migration state is unknown.");
  }
  if (appliedHashes.length > migrations.length || appliedHashes.some((hash, index) => hash !== migrations[index]?.hash)) {
    fail("the applied migration state is not a prefix of the captured release.");
  }
  return migrations.slice(appliedHashes.length).map(({ tag }) => tag);
}

export function sizeCategory(bytes) {
  if (!Number.isSafeInteger(bytes) || bytes < 0) fail("a messaging table size is invalid.");
  if (bytes === 0) return "empty";
  if (bytes <= 1024 * 1024) return "up-to-1MiB";
  if (bytes <= 4 * 1024 * 1024) return "up-to-4MiB";
  if (bytes <= messagingSizeCapBytes) return "up-to-16MiB";
  return "over-16MiB";
}

export function assessMessagingSizes(rows) {
  if (!Array.isArray(rows) || rows.length !== messagingTables.length) fail("one or more messaging tables are unavailable.");
  const sizes = new Map();
  for (const row of rows) {
    const table = row?.table_name;
    const bytes = Number(row?.bytes);
    if (!messagingTables.includes(table) || sizes.has(table) || !Number.isSafeInteger(bytes) || bytes < 0) {
      fail("messaging table metadata is invalid.");
    }
    sizes.set(table, bytes);
  }
  if (messagingTables.some((table) => !sizes.has(table))) fail("one or more messaging tables are unavailable.");
  const total = [...sizes.values()].reduce((sum, bytes) => sum + bytes, 0);
  if (!Number.isSafeInteger(total)) fail("combined messaging table size is invalid.");
  if (total > messagingSizeCapBytes) {
    fail("combined messaging table size exceeds the 16 MiB staging cap.");
  }
  return { total, sizes };
}

async function inspectDatabase(client) {
  try {
    await client.unsafe("BEGIN READ ONLY");
    const identity = await client.unsafe("SELECT current_user, session_user");
    if (identity.length !== 1 || identity[0]?.current_user !== "migrator" || identity[0]?.session_user !== "migrator") {
      fail("the database session is not the migrator role.");
    }
    const roles = await client.unsafe("SELECT rolname FROM pg_roles WHERE rolname IN ('migrator', 'app', 'lifecycle_worker') ORDER BY rolname");
    if (roles.map((row) => row.rolname).join(",") !== "app,lifecycle_worker,migrator") {
      fail("required database roles are unavailable.");
    }
    const ledger = await client.unsafe("SELECT to_regclass('drizzle.__drizzle_migrations') AS migration_ledger");
    if (ledger.length !== 1 || ledger[0]?.migration_ledger !== "drizzle.__drizzle_migrations") {
      fail("the migration ledger is unavailable.");
    }
    const applied = await client.unsafe("SELECT hash FROM drizzle.__drizzle_migrations ORDER BY id ASC");
    const sizes = await client.unsafe(`
      SELECT c.relname AS table_name, pg_total_relation_size(c.oid)::bigint AS bytes
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relkind IN ('r', 'p')
        AND c.relname IN ('conversations', 'conversation_members', 'messages', 'message_reactions', 'conversation_changes')
      ORDER BY c.relname
    `);
    await client.unsafe("COMMIT");
    return { appliedHashes: applied.map((row) => String(row.hash)), sizes };
  } catch (error) {
    try {
      await client.unsafe("ROLLBACK");
    } catch {
      // The read-only transaction may not have started.
    }
    if (error instanceof Error && error.message.startsWith("Staging messaging readiness preflight failed:")) throw error;
    fail("the read-only staging database preflight query failed.");
  }
}

async function defaultClientFactory(connectionString) {
  const require = createRequire(path.resolve("packages/db/package.json"));
  const { default: postgres } = require("postgres");
  return postgres(connectionString, { max: 1, prepare: false, idle_timeout: 5, connect_timeout: 10, onnotice: () => undefined });
}

export async function runStagingMessagingPreflight({
  environment = process.env,
  readFileImpl = readFile,
  clientFactory = defaultClientFactory,
} = {}) {
  const connectionString = validateEnvironment(environment);
  const migrations = await readMigrationState(migrationDirectory(environment), readFileImpl);
  const client = await clientFactory(connectionString);
  try {
    const database = await inspectDatabase(client);
    const pending = pendingMigrationTags(migrations, database.appliedHashes);
    if (!pending.includes(messagingReadinessMigration)) return { required: false, pending };
    const assessment = assessMessagingSizes(database.sizes);
    return { required: true, pending, ...assessment };
  } finally {
    await client.end({ timeout: 5 });
  }
}

export function formatPreflightResult(result) {
  if (!result.required) {
    return `Staging messaging readiness size preflight not required: ${messagingReadinessMigration} is not pending.`;
  }
  const categories = messagingTables.map((table) => `${table}=${sizeCategory(result.sizes.get(table))}`).join(", ");
  return `Staging messaging readiness size preflight passed: ${categories}; combined=${sizeCategory(result.total)}; cap=16MiB.`;
}

async function main() {
  console.log(formatPreflightResult(await runStagingMessagingPreflight()));
}

if (import.meta.main) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : "Staging messaging readiness preflight failed.");
    process.exitCode = 1;
  });
}
