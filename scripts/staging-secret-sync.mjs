export const stagingWorkerSecretNames = Object.freeze({
  betterAuth: "BETTER_AUTH_SECRET",
  google: "GOOGLE_CLIENT_SECRET",
  resend: "RESEND_API_KEY",
  fcm: "FCM_SERVICE_ACCOUNT_JSON",
  pushKey: "PUSH_TOKEN_ENCRYPTION_KEY",
});

const allowedSecretNames = new Set(Object.values(stagingWorkerSecretNames));
const keyVersionBinding = "PUSH_TOKEN_ENCRYPTION_KEY_VERSION";

function requiredSecret(environment, name) {
  const value = environment[name];
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`The staging environment must provide ${name}.`);
  }
  return value;
}

function optionalSecret(environment, name) {
  const value = environment[name];
  if (value === undefined || value === "") return undefined;
  if (typeof value !== "string") throw new Error(`The staging environment must provide ${name} as a string.`);
  return value;
}

/**
 * Read only this reviewed allowlist from the GitHub staging environment. The
 * returned values are for an API request and must never be logged or written.
 */
export function readStagingWorkerSecretSource(environment, requiredAuthSecretNames) {
  if (!Array.isArray(requiredAuthSecretNames) || !requiredAuthSecretNames.every((name) => allowedSecretNames.has(name))) {
    throw new Error("Refusing an unreviewed Worker secret name.");
  }
  const values = {};
  for (const name of requiredAuthSecretNames) values[name] = requiredSecret(environment, name);

  const fcm = optionalSecret(environment, stagingWorkerSecretNames.fcm);
  const pushKey = optionalSecret(environment, stagingWorkerSecretNames.pushKey);
  if ((fcm === undefined) !== (pushKey === undefined)) {
    throw new Error("FCM_SERVICE_ACCOUNT_JSON and PUSH_TOKEN_ENCRYPTION_KEY must be set together or both omitted.");
  }
  const pushKeyVersion = optionalSecret(environment, "STAGING_PUSH_TOKEN_ENCRYPTION_KEY_VERSION");
  if (fcm !== undefined) {
    if (pushKeyVersion === undefined || !/^[A-Za-z0-9._-]{1,64}$/.test(pushKeyVersion)) {
      throw new Error("A valid STAGING_PUSH_TOKEN_ENCRYPTION_KEY_VERSION is required with push secrets.");
    }
    values[stagingWorkerSecretNames.fcm] = fcm;
    values[stagingWorkerSecretNames.pushKey] = pushKey;
  } else if (pushKeyVersion !== undefined) {
    throw new Error("STAGING_PUSH_TOKEN_ENCRYPTION_KEY_VERSION requires both push secrets.");
  }
  return { values, pushKeyVersion };
}

export function readWorkerPushKeyVersion(settingsPayload) {
  const bindings = settingsPayload?.result?.bindings;
  if (!Array.isArray(bindings)) throw new Error("Cloudflare returned invalid Worker settings.");
  const versions = bindings.filter((binding) => binding?.name === keyVersionBinding);
  if (versions.length === 0) return undefined;
  if (versions.length !== 1 || versions[0]?.type !== "plain_text" || typeof versions[0]?.text !== "string" || !/^[A-Za-z0-9._-]{1,64}$/.test(versions[0].text)) {
    throw new Error("Cloudflare returned invalid push key version metadata.");
  }
  return versions[0].text;
}

/**
 * Do not replace an encryption key merely because a GitHub secret changed.
 * Existing key material without an authoritative version needs an owner
 * bootstrap attestation before this workflow may establish the metadata.
 */
export function assertPushKeyVersionGuard({ source, deployedSecretNames, deployedPushKeyVersion, allowOwnerBootstrap = false }) {
  const hasDeployedPushKey = deployedSecretNames.has(stagingWorkerSecretNames.pushKey);
  if (source.pushKeyVersion === undefined) return;
  if (deployedPushKeyVersion === undefined && hasDeployedPushKey && !allowOwnerBootstrap) {
    throw new Error("The existing push encryption key has no version metadata. An owner bootstrap is required before deployment.");
  }
  if (deployedPushKeyVersion !== undefined && deployedPushKeyVersion !== source.pushKeyVersion) {
    throw new Error("The proposed push encryption key version differs from deployed metadata. Complete the controlled rotation first.");
  }
}

function apiUrl(accountId, workerName) {
  if (!/^[a-f0-9]{32}$/.test(accountId) || workerName !== "dayli-api-staging") {
    throw new Error("Refusing an unexpected Cloudflare secret target.");
  }
  return `https://api.cloudflare.com/client/v4/accounts/${accountId}/workers/scripts/${workerName}/secrets`;
}

/** Bulk upsert the reviewed values. No absent optional secret is deleted. */
export async function syncStagingWorkerSecrets({ accountId, workerName, apiToken, source, fetchImpl = fetch }) {
  if (typeof apiToken !== "string" || apiToken.length === 0) throw new Error("CLOUDFLARE_API_TOKEN is required.");
  const entries = Object.entries(source.values);
  if (!entries.length || !entries.every(([name, value]) => allowedSecretNames.has(name) && typeof value === "string" && value.length > 0)) {
    throw new Error("Refusing an invalid staging secret sync request.");
  }
  let response;
  try {
    response = await fetchImpl(apiUrl(accountId, workerName), {
      method: "PUT",
      headers: { Authorization: `Bearer ${apiToken}`, "content-type": "application/json" },
      body: JSON.stringify(entries.map(([name, text]) => ({ name, text, type: "secret_text" }))),
    });
  } catch {
    throw new Error("Cloudflare secret sync could not reach the control plane. No deployment was attempted.");
  }
  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new Error(`Cloudflare secret sync returned invalid JSON (HTTP ${response.status}). No deployment was attempted.`);
  }
  if (!response.ok || payload?.success !== true) {
    throw new Error(`Cloudflare secret sync failed (HTTP ${response.status}). No deployment was attempted; inspect the Worker secret store before retrying.`);
  }
}
