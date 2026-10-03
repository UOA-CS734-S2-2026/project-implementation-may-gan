import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { rmSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { runStagingPushReadiness } from "./staging-push-readiness.ts";

const candidateCommitSha = "a".repeat(40);
const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sentinels = ["client@example.test", "project-secret-id", "private-key-sentinel", "access-token-sentinel", "raw-provider-error"];

function credentials(privateKey: string) {
  return JSON.stringify({
    client_email: "client@example.test",
    private_key: privateKey,
    project_id: "project-secret-id",
  });
}

function writer(output: { value?: string }) {
  return async (_path: string, contents: string) => { output.value = contents; };
}

async function readiness(input: Parameters<typeof runStagingPushReadiness>[0]) {
  const output: { value?: string } = {};
  const result = await runStagingPushReadiness({
    artifactPath: "/safe/artifact.json",
    candidateCommitSha,
    now: () => new Date("2026-10-03T13:00:00.000Z"),
    writeArtifact: writer(output),
    ...input,
  });
  assert.ok(output.value, "the artifact must be written before the result is returned");
  for (const sentinel of sentinels) assert.doesNotMatch(output.value, new RegExp(sentinel));
  return { result, artifact: JSON.parse(output.value) };
}

test("missing source credentials records a no-push skip without a network request", async () => {
  const fetchImpl = async () => { throw new Error("network must not run"); };
  const { result, artifact } = await readiness({ fetchImpl });
  assert.equal(result.exitCode, 0);
  assert.deepEqual(artifact, {
    candidateCommitSha,
    timestamp: "2026-10-03T13:00:00.000Z",
    pass: false,
    outcome: "skipped",
    checks: ["credentials_missing"],
  });
});

test("malformed configured credentials fail closed and write only a fixed category", async () => {
  for (const sourceCredentials of ["{not-json", JSON.stringify({ client_email: "client@example.test", private_key: "private-key-sentinel" })]) {
    const { result, artifact } = await readiness({ sourceCredentials });
    assert.equal(result.exitCode, 1);
    assert.equal(artifact.outcome, "failed");
    assert.match(artifact.checks[0], /service_account_(json|shape)_invalid/);
  }
});

test("OAuth readiness calls only the token endpoint and excludes credential data from evidence", async () => {
  const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const requests: Array<{ url: string; options?: RequestInit }> = [];
  const { result, artifact } = await readiness({
    sourceCredentials: credentials(privateKey.export({ type: "pkcs8", format: "pem" }).toString()),
    fetchImpl: async (url, options) => {
      requests.push({ url: String(url), options });
      return new Response(JSON.stringify({ access_token: "access-token-sentinel", expires_in: 300 }), { status: 200 });
    },
  });
  assert.equal(result.exitCode, 0);
  assert.deepEqual(requests.map(({ url }) => url), ["https://oauth2.googleapis.com/token"]);
  assert.equal(requests[0].options?.redirect, "error");
  assert.deepEqual(artifact.checks, ["oauth_token_acquired"]);
});

test("signing, provider response, and transport failures stay sanitized", async () => {
  const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const validCredentials = credentials(privateKey.export({ type: "pkcs8", format: "pem" }).toString());
  const cases: Array<[string, Parameters<typeof runStagingPushReadiness>[0], string]> = [
    ["signing", { sourceCredentials: credentials("private-key-sentinel") }, "service_account_signing_invalid"],
    ["rejected", { sourceCredentials: validCredentials, fetchImpl: async () => new Response("raw-provider-error", { status: 401 }) }, "oauth_response_rejected"],
    ["invalid", { sourceCredentials: validCredentials, fetchImpl: async () => new Response(JSON.stringify({ error: "raw-provider-error" }), { status: 200 }) }, "oauth_response_invalid"],
    ["null body", { sourceCredentials: validCredentials, fetchImpl: async () => new Response("null", { status: 200 }) }, "oauth_response_invalid"],
    ["null response", { sourceCredentials: validCredentials, fetchImpl: async () => null as unknown as Response }, "oauth_response_invalid"],
    ["missing lifetime", { sourceCredentials: validCredentials, fetchImpl: async () => new Response(JSON.stringify({ access_token: "access-token-sentinel" }), { status: 200 }) }, "oauth_response_invalid"],
    ["zero lifetime", { sourceCredentials: validCredentials, fetchImpl: async () => new Response(JSON.stringify({ access_token: "access-token-sentinel", expires_in: 0 }), { status: 200 }) }, "oauth_response_invalid"],
    ["negative lifetime", { sourceCredentials: validCredentials, fetchImpl: async () => new Response(JSON.stringify({ access_token: "access-token-sentinel", expires_in: -1 }), { status: 200 }) }, "oauth_response_invalid"],
    ["redirect", { sourceCredentials: validCredentials, fetchImpl: async () => new Response(null, { status: 302, headers: { location: "https://not-oauth.example.test" } }) }, "oauth_response_rejected"],
    ["transport", { sourceCredentials: validCredentials, fetchImpl: async () => { throw new Error("raw-provider-error"); } }, "oauth_transport_failed"],
  ];
  for (const [, input, category] of cases) {
    const { result, artifact } = await readiness(input);
    assert.equal(result.exitCode, 1);
    assert.deepEqual(artifact.checks, [category]);
  }
});

test("the checked-in tsx command writes a skipped artifact for absent source credentials", () => {
  const directory = mkdtempSync(resolve(tmpdir(), "dayli-push-readiness-"));
  const artifactPath = resolve(directory, "readiness.json");
  try {
    const result = spawnSync("pnpm", ["exec", "tsx", "scripts/staging-push-readiness.ts"], {
      cwd: repositoryRoot,
      env: {
        ...process.env,
        CANDIDATE_COMMIT_SHA: candidateCommitSha,
        FCM_SERVICE_ACCOUNT_JSON: "",
        PUSH_READINESS_ARTIFACT_PATH: artifactPath,
      },
      encoding: "utf8",
    });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout, "");
    assert.deepEqual(JSON.parse(readFileSync(artifactPath, "utf8")), {
      candidateCommitSha,
      timestamp: JSON.parse(readFileSync(artifactPath, "utf8")).timestamp,
      pass: false,
      outcome: "skipped",
      checks: ["credentials_missing"],
    });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("the checked-in tsx command fails closed for malformed configured credentials", () => {
  const directory = mkdtempSync(resolve(tmpdir(), "dayli-push-readiness-"));
  const artifactPath = resolve(directory, "readiness.json");
  try {
    const result = spawnSync("pnpm", ["exec", "tsx", "scripts/staging-push-readiness.ts"], {
      cwd: repositoryRoot,
      env: {
        ...process.env,
        CANDIDATE_COMMIT_SHA: candidateCommitSha,
        FCM_SERVICE_ACCOUNT_JSON: "{",
        PUSH_READINESS_ARTIFACT_PATH: artifactPath,
      },
      encoding: "utf8",
    });
    assert.equal(result.status, 1, result.stderr);
    assert.equal(result.stdout, "");
    assert.deepEqual(JSON.parse(readFileSync(artifactPath, "utf8")).checks, ["service_account_json_invalid"]);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("invalid candidate metadata also creates a safe failed artifact", async () => {
  const output: { value?: string } = {};
  const result = await runStagingPushReadiness({
    sourceCredentials: "private-key-sentinel",
    candidateCommitSha: "not-a-commit",
    artifactPath: "/safe/artifact.json",
    writeArtifact: writer(output),
  });
  assert.equal(result.exitCode, 1);
  assert.deepEqual(JSON.parse(output.value!), {
    candidateCommitSha: null,
    timestamp: JSON.parse(output.value!).timestamp,
    pass: false,
    outcome: "failed",
    checks: ["candidate_commit_invalid"],
  });
});
