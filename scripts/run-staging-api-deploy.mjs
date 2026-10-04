import { writeFileSync } from "node:fs";
import { validateStagingOrigins } from "./staging-origins.mjs";
import { readCloudflareSecretNames, readStagingAuthBindings } from "./staging-auth-bindings.mjs";
import { assertStagingR2BucketAccess, readStagingMediaBindings } from "./staging-media-bindings.mjs";
import { createStagingWorkerConfigs, readStagingBrowserProxyMode, serializeWranglerConfig } from "./staging-worker-config.mjs";
import { verifyStagingExportWorkerTarget } from "./verify-staging-export-worker-target.mjs";
import {
  assertProjectedWorkerSecretPairing,
  readStagingWorkerSecretSource,
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
const exportWorkerHyperdriveId = required("CLOUDFLARE_STAGING_EXPORT_WORKER_HYPERDRIVE_ID");
const proofKeys = ["STAGING_EXPORT_PROOF_APPROVED", "STAGING_EXPORT_PROOF_USER_ID",
  "STAGING_EXPORT_PROOF_BUILD_UNTIL", "STAGING_EXPORT_PROOF_CLEANUP_REVIEW_AFTER"];
const proofValues = proofKeys.map((key) => process.env[key]);
if (proofValues.some(Boolean) && !proofValues.every(Boolean)) {
  throw new Error("Staging export proof settings must be supplied together.");
}
const exportProofVars = proofValues.every(Boolean)
  ? Object.fromEntries(proofKeys.map((key, index) => [key, proofValues[index]])) : {};
for (const key of ["STAGING_EXPORT_ALL_USERS_APPROVED", "STAGING_EXPORT_CLEANUP_ONLY_APPROVED"]) {
  if (process.env[key]) exportProofVars[key] = process.env[key];
}
// Trash cleanup shares the existing restricted lifecycle_worker binding. Its
// target and role preflight is mandatory for every staging API deployment.
await verifyStagingExportWorkerTarget({});
if (!idPattern.test(accountId) || !idPattern.test(hyperdriveId)) throw new Error("Refusing an invalid Cloudflare account or Hyperdrive ID.");
if (required("STAGING_API_SERVICE_NAME") !== expectedWorkerName) throw new Error("STAGING_API_SERVICE_NAME must be dayli-api-staging.");
if (!hyperdriveNamePattern.test(hyperdriveName)) throw new Error("Refusing an invalid expected Hyperdrive name.");

const { apiOrigin, webOrigin } = validateStagingOrigins({
  siteHost: required("STAGING_AUTH_SITE_HOST"),
  apiOrigin: required("STAGING_AUTH_API_ORIGIN"),
  webOrigin: required("STAGING_AUTH_WEB_ORIGIN"),
});
const browserProxyEnabled = readStagingBrowserProxyMode(process.env.STAGING_BROWSER_PROXY_ENABLED);
const authBindings = readStagingAuthBindings(process.env);
const mediaBindings = readStagingMediaBindings(process.env, accountId);
if (!mediaBindings.vars.R2_BUCKET_NAME || mediaBindings.requiredSecrets.length !== 2) {
  throw new Error("Staging Trash cleanup requires complete R2 bindings and paired credential secrets.");
}
const requiredSecretNames = [...authBindings.requiredSecrets, ...mediaBindings.requiredSecrets];
// Read every source secret before any Cloudflare mutation.
const secretSource = readStagingWorkerSecretSource(process.env, requiredSecretNames);

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
  requiredSecretNames,
});
if (mediaBindings.vars.R2_BUCKET_NAME !== undefined) {
  await assertStagingR2BucketAccess({
    accountId: mediaBindings.vars.R2_ACCOUNT_ID,
    bucketName: mediaBindings.vars.R2_BUCKET_NAME,
    accessKeyId: secretSource.values.R2_ACCESS_KEY_ID,
    secretAccessKey: secretSource.values.R2_SECRET_ACCESS_KEY,
  });
}

const { api, probe } = createStagingWorkerConfigs({
  workerName: expectedWorkerName,
  hyperdriveId,
  exportWorkerHyperdriveId,
  exportProofVars,
  releaseSha: required("STAGING_RELEASE_SHA"),
  authApiOrigin: apiOrigin,
  authWebOrigin: webOrigin,
  authVars: authBindings.vars,
  mediaVars: mediaBindings.vars,
  browserProxyEnabled,
  notificationPublishersEnabled: process.env.STAGING_NOTIFICATION_PUBLISHERS_ENABLED === "true",
  notificationDeliveryEnabled: process.env.STAGING_NOTIFICATION_DELIVERY_ENABLED === "true",
});
writeFileSync("apps/api/wrangler.staging.jsonc", serializeWranglerConfig(api));
writeFileSync("apps/api/wrangler.hyperdrive-test.jsonc", serializeWranglerConfig(probe));
console.log("Staging target and configuration validated. Worker secrets have not been changed.");
