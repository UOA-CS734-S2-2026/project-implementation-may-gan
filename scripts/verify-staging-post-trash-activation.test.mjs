import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { assessEligiblePostTrashRows, runStagingPostTrashActivationPreflight } from "./verify-staging-post-trash-activation.mjs";

const marker = "staging-trash-proof-0123456789abcdef0123456789abcdef";
const digest = createHash("sha256").update(marker).digest("hex");
const exact = {
  reflective_answer: `${marker}:2`, trash_generation: "1", owner_name: `${marker}-2`,
  owner_email: `${marker}-2@synthetic.invalid`, owner_post_count: "1", media_count: "1",
  reservation_count: "1", reservations_exact: true, other_post_refs: "0", avatar_refs: "0",
};

test("admits only the one exact approved synthetic eligible fixture", () => {
  assert.deepEqual(assessEligiblePostTrashRows([exact], digest), { eligible: 1, approved: 1, unknown: 0 });
  assert.deepEqual(assessEligiblePostTrashRows([exact], ""), { eligible: 1, approved: 0, unknown: 1 });
  assert.deepEqual(assessEligiblePostTrashRows([exact], "f".repeat(64)), { eligible: 1, approved: 0, unknown: 1 });
  assert.deepEqual(assessEligiblePostTrashRows([], ""), { eligible: 0, approved: 0, unknown: 0 });
});

test("treats lookalikes, ordinary owners, shared references, and claimed reservations as unknown", () => {
  const lookalikeMarker = "staging-trash-proof-abcdef0123456789abcdef0123456789";
  const rows = [
    { ...exact, owner_email: `${lookalikeMarker}-2@synthetic.invalid`, owner_name: `${lookalikeMarker}-2`, reflective_answer: `${lookalikeMarker}:2` },
    { ...exact, owner_email: "ordinary@example.test", owner_name: "Ordinary" },
    { ...exact, other_post_refs: "1" },
    { ...exact, reservations_exact: false },
  ];
  assert.deepEqual(assessEligiblePostTrashRows(rows, digest), { eligible: 4, approved: 0, unknown: 4 });
});

test("rejects malformed approval before creating a database client", async () => {
  let created = false;
  await assert.rejects(() => runStagingPostTrashActivationPreflight({
    environment: { STAGING_POST_TRASH_APPROVED_MARKER_DIGEST: "not-a-digest" },
    clientFactory: async () => { created = true; throw new Error("must not run"); },
  }), /approved marker digest is invalid/);
  assert.equal(created, false);
});

test("fails closed for unapproved eligibility and executes only read-only SQL", async () => {
  const statements = [];
  const client = {
    async unsafe(statement) {
      statements.push(statement);
      if (statement === "SELECT current_user, session_user") return [{ current_user: "migrator", session_user: "migrator" }];
      if (statement.includes("FROM public.posts post")) return [exact];
      return [];
    },
    async end() {},
  };
  await assert.rejects(() => runStagingPostTrashActivationPreflight({
    environment: {
      MIGRATION_TARGET: "staging",
      DATABASE_URL: "postgresql://migrator:secret@direct.neon.tech/dayli?sslmode=require",
      STAGING_POST_TRASH_APPROVED_MARKER_DIGEST: "",
    },
    clientFactory: async () => client,
  }), /unknown eligible content blocks activation/);
  assert.equal(statements[0], "BEGIN READ ONLY");
  assert.equal(statements.some((statement) => /^\s*(insert|update|delete|call)\b/i.test(statement)), false);
  assert.equal(statements.at(-1), "COMMIT");
});

test("wires one captured operator digest into two read-only gates before staging writes", () => {
  const release = readFileSync(new URL("../.github/workflows/staging-release.yml", import.meta.url), "utf8");
  const deploy = readFileSync(new URL("../.github/workflows/staging-hyperdrive.yml", import.meta.url), "utf8");
  assert.match(release, /post_trash_approved_marker_digest:[\s\S]*default: ""/);
  assert.match(release, /post_trash_approval_digest: \$\{\{ steps\.release\.outputs\.post_trash_approval_digest \}\}/);
  const gates = [...deploy.matchAll(/verify-staging-post-trash-activation\.mjs/g)].map((match) => match.index);
  assert.equal(gates.length, 2);
  assert.ok(gates[0] < deploy.indexOf("Apply pending reviewed migrations"));
  assert.ok(gates[1] > deploy.indexOf("Dry-run generated Worker configurations"));
  assert.ok(gates[1] < deploy.indexOf("Synchronize reviewed Worker secrets"));
  assert.ok(gates[1] < deploy.indexOf("Deploy the reviewed staging API Worker"));
  assert.doesNotMatch(deploy, /STAGING_POST_TRASH_APPROVED_MARKER_DIGEST:[\s\S]{0,500}run-staging-api-deploy/);
});
