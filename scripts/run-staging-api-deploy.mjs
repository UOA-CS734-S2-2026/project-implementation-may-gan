import { writeFileSync } from "node:fs";
import { validateStagingOrigins } from "./staging-origins.mjs";
import { readCloudflareSecretNames, readStagingAuthBindings } from "./staging-auth-bindings.mjs";
import { createStagingWorkerConfigs, serializeWranglerConfig } from "./staging-worker-config.mjs";
import {
  assertProjectedWorkerSecretPairing,
  readStagingWorkerSecretSource,
  syncStagingWorkerSecrets,
} from "./staging-secret-sync.mjs";

const expectedWorkerName = "dayli-api-staging";
const idPattern = /^[a-f0-9]{32}$/;
const hyperdriveNamePattern = /^[A-Za-z0-9][A-Za-z0-9 ._-]{0,62}$/;

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`The staging environment must provide ${name}.`);
  return value;
}

async function request(path, apiToken) {
  let response;
  try {
    response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${required("CLOUDFLARE_ACCOUNT_ID")}${path}`, {
      headers: { Authorization: `Bearer ${apiToken}` },
    });
  } catch {
    throw new Error("Cloudflare staging validation could not reach the control plane.");
  }
  if (!response.ok) throw new Error(`Cloudflare staging validation failed (HTTP ${response.status}).`);
  try {
    return await response.json();
  } catch {
    throw new Error("Cloudflare staging validation returned invalid JSON.");
  }
}

const accountId = required("CLOUDFLARE_ACCOUNT_ID");
const apiToken = required("CLOUDFLARE_API_TOKEN");
const hyperdriveId = required("CLOUDFLARE_STAGING_HYPERDRIVE_ID");
const hyperdriveName = required("STAGING_HYPERDRIVE_NAME");
if (!idPattern.test(accountId) || !idPattern.test(hyperdriveId)) throw new Error("Refusing an invalid Cloudflare account or Hyperdrive ID.");
if (required("STAGING_API_SERVICE_NAME") !== expectedWorkerName) throw new Error("STAGING_API_SERVICE_NAME must be dayli-api-staging.");
if (!hyperdriveNamePattern.test(hyperdriveName)) throw new Error("Refusing an invalid expected Hyperdrive name.");

const { apiOrigin, webOrigin } = validateStagingOrigins({
  siteHost: required("STAGING_AUTH_SITE_HOST"),
  apiOrigin: required("STAGING_AUTH_API_ORIGIN"),
  webOrigin: required("STAGING_AUTH_WEB_ORIGIN"),
});
const authBindings = readStagingAuthBindings(process.env);
// Read every source secret before any Cloudflare mutation.
const secretSource = readStagingWorkerSecretSource(process.env, authBindings.requiredSecrets);

const hyperdrive = await request(`/hyperdrive/configs/${hyperdriveId}`, apiToken);
if (hyperdrive?.result?.name !== hyperdriveName || hyperdrive?.result?.caching?.disabled !== true) {
  throw new Error("CLOUDFLARE_STAGING_HYPERDRIVE_ID is not the expected uncached staging Hyperdrive.");
}
const scripts = await request("/workers/scripts", apiToken);
if (!Array.isArray(scripts?.result) || !scripts.result.some((script) => script?.id === expectedWorkerName)) {
  throw new Error("The exact staging Worker must exist before secret sync or deployment.");
}
const secretNames = readCloudflareSecretNames(await request(`/workers/scripts/${expectedWorkerName}/secrets`, apiToken));
assertProjectedWorkerSecretPairing({
  existingSecretNames: secretNames,
  source: secretSource,
  requiredAuthSecretNames: authBindings.requiredSecrets,
});

const { api, probe } = createStagingWorkerConfigs({
  workerName: expectedWorkerName,
  hyperdriveId,
  authApiOrigin: apiOrigin,
  authWebOrigin: webOrigin,
  authVars: authBindings.vars,
});
writeFileSync("apps/api/wrangler.staging.jsonc", serializeWranglerConfig(api));
writeFileSync("apps/api/wrangler.hyperdrive-test.jsonc", serializeWranglerConfig(probe));
if (process.env.STAGING_SECRET_SYNC === "true") {
  await syncStagingWorkerSecrets({ accountId, workerName: expectedWorkerName, apiToken, source: secretSource });
  console.log("Staging target validated and reviewed Worker secrets synchronized.");
} else {
  console.log("Staging target and configuration validated. Worker secrets have not been changed.");
}
