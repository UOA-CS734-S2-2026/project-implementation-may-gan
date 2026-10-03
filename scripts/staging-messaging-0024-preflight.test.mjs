import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  assessMessagingSizes,
  defaultClientFactory,
  formatPreflightResult,
  messagingReadinessMigration,
  messagingSizeCapBytes,
  messagingTables,
  pendingMigrationTags,
  runStagingMessagingPreflight,
} from "./staging-messaging-0024-preflight.mjs";

const bodies = new Map([
  ["0000_fixture", Buffer.from("select 0;")],
  [messagingReadinessMigration, Buffer.from("select 23;")],
]);
const hashes = [...bodies.values()].map((body) => createHash("sha256").update(body).digest("hex"));

function environment() {
  return {
    MIGRATION_TARGET: "staging",
    DATABASE_URL: "postgresql://migrator:private-password@ep-staging-123.us-east-2.aws.neon.tech/neondb?sslmode=require",
    MIGRATIONS_DIR: "/captured/migrations",
  };
}

async function readFileFixture(file) {
  if (file.endsWith("meta/_journal.json")) {
    return JSON.stringify({ entries: [...bodies.keys()].map((tag) => ({ tag })) });
  }
  const body = bodies.get(file.split("/").at(-1)?.replace(/\.sql$/, ""));
  if (!body) throw new Error("missing fixture");
  return body;
}

function tableRows(total = messagingSizeCapBytes) {
  const each = Math.floor(total / messagingTables.length);
  return messagingTables.map((table, index) => ({
    table_name: table,
    bytes: index === 0 ? total - each * (messagingTables.length - 1) : each,
  }));
}

function clientFixture({ appliedHashes = [hashes[0]], sizes = tableRows(), roles = ["app", "lifecycle_worker", "migrator"], ledger = true } = {}) {
  return {
    async unsafe(query) {
      if (query === "BEGIN READ ONLY" || query.startsWith("SET LOCAL ") || query === "COMMIT" || query === "ROLLBACK") return [];
      if (query.includes("current_user")) return [{ current_user: "migrator", session_user: "migrator" }];
      if (query.includes("FROM pg_roles")) return roles.map((rolname) => ({ rolname }));
      if (query.includes("to_regclass")) return [{ migration_ledger: ledger ? "drizzle.__drizzle_migrations" : null }];
      if (query.includes("FROM drizzle.__drizzle_migrations")) return appliedHashes.map((hash) => ({ hash }));
      if (query.includes("pg_total_relation_size")) return sizes;
      throw new Error("unexpected query");
    },
    async end() {},
  };
}

test("loads the callable postgres CJS export from the tooling package without hosted credentials", async () => {
  const originalCwd = process.cwd();
  const isolatedCwd = mkdtempSync(join(tmpdir(), "dayli-preflight-cwd-"));
  let client;
  try {
    process.chdir(isolatedCwd);
    client = await defaultClientFactory("postgresql://migrator:fixture@127.0.0.1:1/dayli?sslmode=require");
    assert.equal(typeof client.unsafe, "function");
  } finally {
    await client?.end({ timeout: 0 });
    process.chdir(originalCwd);
    rmSync(isolatedCwd, { recursive: true, force: true });
  }
});

test("sanitizes PostgreSQL client factory errors", async () => {
  for (const factory of [
    () => defaultClientFactory("postgresql://migrator:factory-secret@localhost:not-a-port/dayli"),
    () => { throw new Error("factory-secret"); },
  ]) {
    await assert.rejects(
      runStagingMessagingPreflight({
        environment: environment(),
        readFileImpl: readFileFixture,
        clientFactory: factory,
      }),
      (error) => /PostgreSQL client could not be initialized/.test(error.message) && !error.message.includes("factory-secret"),
    );
  }
});

test("sets bounded local timeouts immediately after opening the read-only transaction", async () => {
  const calls = [];
  const fixture = clientFixture();
  await runStagingMessagingPreflight({
    environment: environment(),
    readFileImpl: readFileFixture,
    clientFactory: () => ({
      async unsafe(query) {
        calls.push(query);
        return fixture.unsafe(query);
      },
      end: fixture.end,
    }),
  });
  assert.deepEqual(calls.slice(0, 4), [
    "BEGIN READ ONLY",
    "SET LOCAL lock_timeout = '5s'",
    "SET LOCAL statement_timeout = '10s'",
    "SET LOCAL idle_in_transaction_session_timeout = '10s'",
  ]);
});

test("requires the exact 0024 pending suffix and accepts the conservative staging cap", async () => {
  const result = await runStagingMessagingPreflight({
    environment: environment(),
    readFileImpl: readFileFixture,
    clientFactory: () => clientFixture(),
  });
  assert.equal(result.required, true);
  assert.deepEqual(result.pending, [messagingReadinessMigration]);
  assert.equal(result.total, messagingSizeCapBytes);
});

test("does not run the size gate when 0024 is already applied", async () => {
  const result = await runStagingMessagingPreflight({
    environment: environment(),
    readFileImpl: readFileFixture,
    clientFactory: () => clientFixture({ appliedHashes: hashes }),
  });
  assert.equal(result.required, false);
  assert.deepEqual(result.pending, []);
});

test("logs only size categories and the fixed cap", async () => {
  const result = await runStagingMessagingPreflight({
    environment: environment(),
    readFileImpl: readFileFixture,
    clientFactory: () => clientFixture({ sizes: tableRows(5 * 1024 * 1024) }),
  });
  const summary = formatPreflightResult(result);
  assert.match(summary, /passed: conversations=up-to-1MiB/);
  assert.match(summary, /combined=up-to-16MiB; cap=16MiB/);
  assert.doesNotMatch(summary, /1048576|5242880|\d+B\b|total=/);
});

test("fails closed for an oversized table set, missing roles, ledger, or non-prefix state", async () => {
  await assert.rejects(
    runStagingMessagingPreflight({
      environment: environment(),
      readFileImpl: readFileFixture,
      clientFactory: () => clientFixture({ sizes: tableRows(messagingSizeCapBytes + 1) }),
    }),
    /staging cap/,
  );
  for (const options of [
    { roles: ["app", "migrator"] },
    { ledger: false },
    { appliedHashes: ["not-a-captured-hash"] },
  ]) {
    await assert.rejects(
      runStagingMessagingPreflight({
        environment: environment(),
        readFileImpl: readFileFixture,
        clientFactory: () => clientFixture(options),
      }),
      /required database roles|migration ledger|not a prefix/,
    );
  }
});

test("rejects incomplete table metadata and unknown applied state without leaking the connection string", async () => {
  assert.throws(() => assessMessagingSizes(tableRows().slice(1)), /messaging tables are unavailable/);
  assert.throws(() => pendingMigrationTags([{ tag: "one", hash: "one" }], ["other"]), /not a prefix/);
  await assert.rejects(
    runStagingMessagingPreflight({
      environment: { ...environment(), MIGRATION_TARGET: "production" },
      readFileImpl: readFileFixture,
      clientFactory: () => clientFixture(),
    }),
    (error) => /MIGRATION_TARGET must be staging/.test(error.message) && !error.message.includes("private-password"),
  );
  await assert.rejects(
    runStagingMessagingPreflight({
      environment: environment(),
      readFileImpl: readFileFixture,
      clientFactory: () => ({ unsafe: async () => { throw new Error("database detail"); }, end: async () => {} }),
    }),
    /read-only staging database preflight query failed/,
  );
  await assert.rejects(
    runStagingMessagingPreflight({
      environment: environment(),
      readFileImpl: readFileFixture,
      clientFactory: () => ({ ...clientFixture(), end: async () => { throw new Error("close-secret"); } }),
    }),
    (error) => /could not be closed/.test(error.message) && !error.message.includes("close-secret"),
  );
});
