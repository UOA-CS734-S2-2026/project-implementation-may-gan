import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import {
  assessMessagingSizes,
  formatPreflightResult,
  messagingReadinessMigration,
  messagingSizeCapBytes,
  messagingTables,
  pendingMigrationTags,
  runStagingMessagingPreflight,
} from "./staging-messaging-0023-preflight.mjs";

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
      if (query === "BEGIN READ ONLY" || query === "COMMIT" || query === "ROLLBACK") return [];
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

test("requires the exact 0023 pending suffix and accepts the conservative staging cap", async () => {
  const result = await runStagingMessagingPreflight({
    environment: environment(),
    readFileImpl: readFileFixture,
    clientFactory: () => clientFixture(),
  });
  assert.equal(result.required, true);
  assert.deepEqual(result.pending, [messagingReadinessMigration]);
  assert.equal(result.total, messagingSizeCapBytes);
});

test("does not run the size gate when 0023 is already applied", async () => {
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
});
