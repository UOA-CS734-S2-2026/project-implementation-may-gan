#!/usr/bin/env node

import { validateStagingOrigins } from "./staging-origins.mjs";

const idPattern = /^[a-f0-9]{32}$/;

function fail() {
  throw new Error("Staging Trash proof API target preflight failed.");
}

export async function verifyStagingTrashProofTarget({ environment = process.env, fetchImpl = fetch }) {
  const accountId = environment.CLOUDFLARE_ACCOUNT_ID;
  const token = environment.CLOUDFLARE_API_TOKEN;
  const serviceName = environment.STAGING_API_SERVICE_NAME;
  if (!idPattern.test(accountId ?? "") || !token || serviceName !== "dayli-api-staging") fail();
  let apiOrigin;
  try {
    ({ apiOrigin } = validateStagingOrigins({
      siteHost: environment.STAGING_AUTH_SITE_HOST,
      apiOrigin: environment.STAGING_AUTH_API_ORIGIN,
      webOrigin: environment.STAGING_AUTH_WEB_ORIGIN,
    }));
  } catch {
    fail();
  }

  let payload;
  try {
    const response = await fetchImpl(`https://api.cloudflare.com/client/v4/accounts/${accountId}/workers/domains`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) fail();
    payload = await response.json();
  } catch {
    fail();
  }
  if (payload?.success !== true || !Array.isArray(payload.result)) fail();
  const hostname = new URL(apiOrigin).hostname;
  const matches = payload.result.filter((domain) => domain?.hostname === hostname);
  if (matches.length !== 1 || matches[0]?.service !== serviceName || matches[0]?.environment !== "production") fail();
  return { apiOrigin };
}

if (import.meta.main) {
  verifyStagingTrashProofTarget({}).then(
    () => console.log("Staging Trash proof API target metadata verified."),
    () => { console.error("Staging Trash proof API target preflight failed."); process.exitCode = 1; },
  );
}
