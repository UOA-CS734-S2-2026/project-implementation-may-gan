export const stagingWorkerSecretNames = Object.freeze({
  betterAuth: "BETTER_AUTH_SECRET",
  google: "GOOGLE_CLIENT_SECRET",
  resend: "RESEND_API_KEY",
  fcm: "FCM_SERVICE_ACCOUNT_JSON",
  pushKey: "PUSH_TOKEN_ENCRYPTION_KEY",
});

// PUSH_TOKEN_ENCRYPTION_KEY is intentionally absent. It is provisioned and
// rotated directly in Cloudflare because replacing it breaks existing ciphertext.
const syncedSecretNames = new Set([
  stagingWorkerSecretNames.betterAuth,
  stagingWorkerSecretNames.google,
  stagingWorkerSecretNames.resend,
  stagingWorkerSecretNames.fcm,
]);

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

/** Read only the reviewed GitHub Environment secret allowlist. */
export function readStagingWorkerSecretSource(environment, requiredAuthSecretNames) {
  if (!Array.isArray(requiredAuthSecretNames) || !requiredAuthSecretNames.every((name) => syncedSecretNames.has(name))) {
    throw new Error("Refusing an unreviewed Worker secret name.");
  }
  const values = {};
  for (const name of requiredAuthSecretNames) values[name] = requiredSecret(environment, name);
  const fcm = optionalSecret(environment, stagingWorkerSecretNames.fcm);
  if (fcm !== undefined) values[stagingWorkerSecretNames.fcm] = fcm;
  return { values };
}

/**
 * Validate the resulting Worker secret-name set without reading secret values.
 * A key by itself is allowed for one-time owner provisioning. FCM is never
 * allowed without that existing key. Provider secrets must match public vars.
 */
export function assertProjectedWorkerSecretPairing({ existingSecretNames, source, requiredAuthSecretNames }) {
  if (!(existingSecretNames instanceof Set)) throw new Error("Cloudflare returned invalid Worker secret names.");
  if (!Array.isArray(requiredAuthSecretNames) || !requiredAuthSecretNames.every((name) => syncedSecretNames.has(name))) {
    throw new Error("Refusing an unreviewed Worker secret name.");
  }
  const projected = new Set([...existingSecretNames, ...Object.keys(source.values)]);
  for (const name of [stagingWorkerSecretNames.google, stagingWorkerSecretNames.resend]) {
    const required = requiredAuthSecretNames.includes(name);
    if (projected.has(name) !== required) {
      throw new Error(`${name} must match its complete public staging configuration.`);
    }
  }
  if (!projected.has(stagingWorkerSecretNames.betterAuth)) {
    throw new Error("The staging Worker requires BETTER_AUTH_SECRET.");
  }
  if (projected.has(stagingWorkerSecretNames.fcm) && !existingSecretNames.has(stagingWorkerSecretNames.pushKey)) {
    throw new Error("FCM_SERVICE_ACCOUNT_JSON requires an existing Cloudflare PUSH_TOKEN_ENCRYPTION_KEY.");
  }
  if (Object.hasOwn(source.values, stagingWorkerSecretNames.fcm) && !existingSecretNames.has(stagingWorkerSecretNames.pushKey)) {
    throw new Error("FCM_SERVICE_ACCOUNT_JSON cannot be synchronized until an owner provisions PUSH_TOKEN_ENCRYPTION_KEY in Cloudflare.");
  }
}

function apiUrl(accountId, workerName) {
  if (!/^[a-f0-9]{32}$/.test(accountId) || workerName !== "dayli-api-staging") {
    throw new Error("Refusing an unexpected Cloudflare secret target.");
  }
  return `https://api.cloudflare.com/client/v4/accounts/${accountId}/workers/scripts/${workerName}/secrets-bulk`;
}

/** Bulk-upsert reviewed secret values. Omitted secrets, including the push key, are untouched. */
export async function syncStagingWorkerSecrets({ accountId, workerName, apiToken, source, fetchImpl = fetch }) {
  if (typeof apiToken !== "string" || apiToken.length === 0) throw new Error("CLOUDFLARE_API_TOKEN is required.");
  const entries = Object.entries(source.values);
  if (!entries.length || !entries.every(([name, value]) => syncedSecretNames.has(name) && typeof value === "string" && value.length > 0)) {
    throw new Error("Refusing an invalid staging secret sync request.");
  }
  const secrets = Object.fromEntries(entries.map(([name, text]) => [name, { name, text, type: "secret_text" }]));
  let response;
  try {
    response = await fetchImpl(apiUrl(accountId, workerName), {
      method: "PATCH",
      headers: { Authorization: `Bearer ${apiToken}`, "content-type": "application/json" },
      body: JSON.stringify({ secrets }),
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
  const errors = payload?.errors;
  const result = payload?.result;
  const requestedNames = entries.map(([name]) => name).sort();
  const resultNames = result !== null && typeof result === "object" && !Array.isArray(result)
    ? Object.keys(result).sort()
    : [];
  const complete = response.ok
    && payload?.success === true
    && Array.isArray(errors)
    && errors.length === 0
    && resultNames.length === requestedNames.length
    && resultNames.every((name, index) => name === requestedNames[index])
    && resultNames.every((name) => result[name]?.name === name && result[name]?.type === "secret_text");
  if (!complete) {
    throw new Error(`Cloudflare secret sync failed (HTTP ${response.status}). No deployment was attempted; inspect the Worker secret store before retrying.`);
  }
}
