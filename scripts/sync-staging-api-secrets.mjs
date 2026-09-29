import { readCloudflareSecretNames, readStagingAuthBindings } from "./staging-auth-bindings.mjs";
import { readStagingMediaBindings } from "./staging-media-bindings.mjs";
import {
  assertProjectedWorkerSecretPairing,
  readStagingWorkerSecretSource,
  syncStagingWorkerSecrets,
} from "./staging-secret-sync.mjs";

const workerName = "dayli-api-staging";
const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
const apiToken = process.env.CLOUDFLARE_API_TOKEN;
if (!/^[a-f0-9]{32}$/.test(accountId ?? "")) throw new Error("Refusing an invalid Cloudflare account ID.");
if (typeof apiToken !== "string" || apiToken.length === 0) throw new Error("CLOUDFLARE_API_TOKEN is required.");
if (process.env.STAGING_API_SERVICE_NAME !== workerName) throw new Error("STAGING_API_SERVICE_NAME must be dayli-api-staging.");

async function request(path) {
  let response;
  try {
    response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}${path}`, {
      headers: { Authorization: `Bearer ${apiToken}` },
    });
  } catch {
    throw new Error("Cloudflare secret target validation could not reach the control plane.");
  }
  if (!response.ok) throw new Error(`Cloudflare secret target validation failed (HTTP ${response.status}).`);
  try {
    return await response.json();
  } catch {
    throw new Error("Cloudflare secret target validation returned invalid JSON.");
  }
}

const authBindings = readStagingAuthBindings(process.env);
const mediaBindings = readStagingMediaBindings(process.env, accountId);
const requiredSecretNames = [...authBindings.requiredSecrets, ...mediaBindings.requiredSecrets];
const source = readStagingWorkerSecretSource(process.env, requiredSecretNames);
const scripts = await request("/workers/scripts");
if (!Array.isArray(scripts?.result) || !scripts.result.some((script) => script?.id === workerName)) {
  throw new Error("The exact staging Worker must exist before secret sync.");
}
const existingSecretNames = readCloudflareSecretNames(await request(`/workers/scripts/${workerName}/secrets`));
assertProjectedWorkerSecretPairing({ existingSecretNames, source, requiredSecretNames });
await syncStagingWorkerSecrets({ accountId, workerName, apiToken, source });
console.log("Reviewed staging Worker secrets synchronized.");
