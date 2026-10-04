#!/usr/bin/env node

// Read-only control-plane preflight. Never log provider responses or connection strings.
import {
  assertMatchingDatabaseTargets,
  readDirectMigratorTarget,
  readHyperdriveTarget,
} from "./verify-staging-schema-target.mjs";

const idPattern = /^[a-f0-9]{32}$/;
function fail() {
  throw new Error("Staging export worker Hyperdrive preflight failed.");
}

export async function verifyStagingExportWorkerTarget({ environment = process.env, fetchImpl = fetch }) {
  const accountId = environment.CLOUDFLARE_ACCOUNT_ID;
  const token = environment.CLOUDFLARE_API_TOKEN;
  const appId = environment.CLOUDFLARE_STAGING_HYPERDRIVE_ID;
  const workerId = environment.CLOUDFLARE_STAGING_EXPORT_WORKER_HYPERDRIVE_ID;
  if (!idPattern.test(accountId ?? "") || !idPattern.test(appId ?? "") ||
      !idPattern.test(workerId ?? "") || appId === workerId || !token) fail();

  const direct = readDirectMigratorTarget(environment.DATABASE_URL ?? "");
  const getConfig = async (id) => {
    let response;
    try {
      response = await fetchImpl(`https://api.cloudflare.com/client/v4/accounts/${accountId}/hyperdrive/configs/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) fail();
      const config = await response.json();
      if (config?.success !== true) fail();
      return config;
    } catch {
      fail();
    }
  };

  const app = await getConfig(appId);
  const worker = await getConfig(workerId);
  assertMatchingDatabaseTargets(direct, readHyperdriveTarget(app));
  assertMatchingDatabaseTargets(direct, readHyperdriveTarget(worker, "lifecycle_worker"));
  if (worker.result?.caching?.disabled !== true) fail();
}

if (import.meta.main) {
  verifyStagingExportWorkerTarget({}).then(
    () => console.log("Restricted staging export worker target matches the verified database and has caching disabled."),
    () => { console.error("Staging export worker Hyperdrive preflight failed."); process.exitCode = 1; },
  );
}
