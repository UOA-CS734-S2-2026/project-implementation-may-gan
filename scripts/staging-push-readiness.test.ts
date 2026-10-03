import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import test from "node:test";
import { runStagingPushReadiness } from "./staging-push-readiness.ts";

const candidateCommitSha = "a".repeat(40);
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
    pass: true,
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
  const requests: string[] = [];
  const { result, artifact } = await readiness({
    sourceCredentials: credentials(privateKey.export({ type: "pkcs8", format: "pem" }).toString()),
    fetchImpl: async (url) => {
      requests.push(String(url));
      return new Response(JSON.stringify({ access_token: "access-token-sentinel", expires_in: 300 }), { status: 200 });
    },
  });
  assert.equal(result.exitCode, 0);
  assert.deepEqual(requests, ["https://oauth2.googleapis.com/token"]);
  assert.deepEqual(artifact.checks, ["oauth_token_acquired"]);
});

test("signing, provider response, and transport failures stay sanitized", async () => {
  const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const validCredentials = credentials(privateKey.export({ type: "pkcs8", format: "pem" }).toString());
  const cases: Array<[string, Parameters<typeof runStagingPushReadiness>[0], string]> = [
    ["signing", { sourceCredentials: credentials("private-key-sentinel") }, "service_account_signing_invalid"],
    ["rejected", { sourceCredentials: validCredentials, fetchImpl: async () => new Response("raw-provider-error", { status: 401 }) }, "oauth_response_rejected"],
    ["invalid", { sourceCredentials: validCredentials, fetchImpl: async () => new Response(JSON.stringify({ error: "raw-provider-error" }), { status: 200 }) }, "oauth_response_invalid"],
    ["transport", { sourceCredentials: validCredentials, fetchImpl: async () => { throw new Error("raw-provider-error"); } }, "oauth_transport_failed"],
  ];
  for (const [, input, category] of cases) {
    const { result, artifact } = await readiness(input);
    assert.equal(result.exitCode, 1);
    assert.deepEqual(artifact.checks, [category]);
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
