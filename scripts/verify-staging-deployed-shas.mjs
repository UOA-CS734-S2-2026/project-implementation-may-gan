import { fileURLToPath } from "node:url";

const SHA = /^[a-f0-9]{40}$/;
const ACCOUNT_ID = /^[a-f0-9]{32}$/;

function fail(message) {
  throw new Error(`Refusing staging signup activation: ${message}`);
}

function required(name, environment = process.env) {
  const value = environment[name];
  if (!value) fail(`${name} is required.`);
  return value;
}

function assertSha(value, name = "commit SHA") {
  if (!SHA.test(value ?? "")) fail(`${name} must be a 40-character lowercase commit SHA.`);
  return value;
}

function assertWorkerName(value, name) {
  if (value !== "dayli-api-staging" && value !== "dayli-web-staging") {
    fail(`${name} must name an approved staging Worker.`);
  }
  return value;
}

function result(value, path) {
  if (!value || typeof value !== "object" || value.success !== true || !("result" in value)) {
    fail(`Cloudflare did not return a successful response for ${path}.`);
  }
  return value.result;
}

/**
 * The first deployment is the currently active deployment, not the latest
 * successful GitHub job. Require one version at 100% traffic so a partial
 * rollout or a stale version cannot publish legal state.
 */
export function assertCurrentWorkerRelease({ workerName, expectedSha, deployments, versions }) {
  assertWorkerName(workerName, "workerName");
  assertSha(expectedSha);
  if (!Array.isArray(deployments) || deployments.length === 0) {
    fail(`${workerName} has no active deployment.`);
  }
  const deployment = deployments[0];
  if (!deployment || !Array.isArray(deployment.versions) || deployment.versions.length !== 1) {
    fail(`${workerName} must have exactly one active Worker version.`);
  }
  const traffic = deployment.versions[0];
  if (!traffic || typeof traffic.version_id !== "string" || traffic.percentage !== 100) {
    fail(`${workerName} is not serving one version at 100% traffic.`);
  }
  const version = versions.get(traffic.version_id);
  if (!version || typeof version !== "object") fail(`${workerName} active version could not be read.`);
  const annotations = version.annotations;
  if (!annotations || annotations["workers/tag"] !== expectedSha
    || annotations["workers/message"] !== `staging-release:${expectedSha}`) {
    fail(`${workerName} active version is not immutably attributed to the requested commit.`);
  }
  return { workerName, versionId: traffic.version_id };
}

async function cloudflareRequest(path, { accountId, apiToken, fetchImpl = fetch }) {
  let response;
  try {
    response = await fetchImpl(`https://api.cloudflare.com/client/v4/accounts/${accountId}${path}`, {
      headers: { Authorization: `Bearer ${apiToken}` },
    });
  } catch {
    fail("Cloudflare control-plane verification could not be reached.");
  }
  if (!response.ok) fail(`Cloudflare control-plane verification failed (HTTP ${response.status}).`);
  try {
    return result(await response.json(), path);
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Refusing staging signup activation:")) throw error;
    fail(`Cloudflare returned invalid JSON for ${path}.`);
  }
}

/** Query the active deployment and its immutable Worker version annotations. */
export async function verifyDeployedWorkerSha({ accountId, apiToken, workerName, expectedSha, request = cloudflareRequest }) {
  if (!ACCOUNT_ID.test(accountId ?? "")) fail("CLOUDFLARE_ACCOUNT_ID is invalid.");
  assertWorkerName(workerName, "workerName");
  assertSha(expectedSha);
  const encodedWorker = encodeURIComponent(workerName);
  const deploymentsResult = await request(`/workers/scripts/${encodedWorker}/deployments`, { accountId, apiToken });
  const deployments = deploymentsResult?.deployments;
  if (!Array.isArray(deployments) || deployments.length === 0) fail(`${workerName} has no active deployment.`);
  const versionIds = deployments[0]?.versions;
  if (!Array.isArray(versionIds) || versionIds.length !== 1 || typeof versionIds[0]?.version_id !== "string") {
    fail(`${workerName} must have exactly one active Worker version.`);
  }
  const versionId = versionIds[0].version_id;
  const version = await request(`/workers/scripts/${encodedWorker}/versions/${encodeURIComponent(versionId)}`, { accountId, apiToken });
  return assertCurrentWorkerRelease({
    workerName,
    expectedSha,
    deployments,
    versions: new Map([[versionId, version]]),
  });
}

export async function verifyStagingDeployedShas({
  accountId,
  apiToken,
  expectedSha,
  apiWorkerName = "dayli-api-staging",
  webWorkerName = "dayli-web-staging",
  request,
}) {
  const api = await verifyDeployedWorkerSha({ accountId, apiToken, workerName: apiWorkerName, expectedSha, request });
  const web = await verifyDeployedWorkerSha({ accountId, apiToken, workerName: webWorkerName, expectedSha, request });
  return { api, web };
}

async function main() {
  const accountId = required("CLOUDFLARE_ACCOUNT_ID");
  const apiToken = required("CLOUDFLARE_API_TOKEN");
  const expectedSha = assertSha(required("EXPECTED_RELEASE_SHA"), "EXPECTED_RELEASE_SHA");
  const verified = await verifyStagingDeployedShas({ accountId, apiToken, expectedSha });
  process.stdout.write(`staging_signup_activation deployed_api_version=${verified.api.versionId} deployed_web_version=${verified.web.versionId} release_sha=${expectedSha}\n`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : "Staging signup activation verification failed."}\n`);
    process.exitCode = 1;
  });
}
