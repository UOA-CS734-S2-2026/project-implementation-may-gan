import rateLimitBindings from "../apps/api/rate-limit-bindings.json" with { type: "json" };

const sharedWorkerConfig = {
  $schema: "node_modules/wrangler/config-schema.json",
  main: "src/index.ts",
  compatibility_date: "2026-03-10",
  compatibility_flags: ["nodejs_compat"],
};

export const rateLimitConfig = rateLimitBindings.map(({ name, namespaceId, limit, period }) => ({
  name,
  namespace_id: namespaceId,
  simple: { limit, period },
}));

export function readStagingBrowserProxyMode(value) {
  if (value === undefined || value === "" || value === "false") return false;
  if (value === "true") return true;
  throw new Error("STAGING_BROWSER_PROXY_ENABLED must be true or false.");
}

const durableObjectConfig = {
  durable_objects: {
    bindings: [{ name: "USER_REALTIME", class_name: "UserRealtime" }],
  },
  migrations: [{ tag: "v1", new_sqlite_classes: ["UserRealtime"] }],
  triggers: { crons: ["*/1 * * * *"] },
};

/**
 * Build only reviewed staging configuration. Secrets never enter this object.
 * The service-entrypoint probe intentionally has no cron or Durable Object
 * binding, so it cannot schedule repair work against the staging database.
 */
export function createStagingWorkerConfigs({
  workerName,
  hyperdriveId,
  exportWorkerHyperdriveId,
  exportProofVars = {},
  authApiOrigin,
  authWebOrigin,
  authVars = {},
  mediaVars = {},
  browserProxyEnabled = false,
}) {
  if (typeof workerName !== "string" || !/^dayli-api-staging$/.test(workerName)) {
    throw new Error("Refusing an unexpected staging Worker name.");
  }
  if (typeof hyperdriveId !== "string" || !/^[a-f0-9]{32}$/.test(hyperdriveId)) {
    throw new Error("Refusing an invalid staging Hyperdrive ID.");
  }
  if (exportWorkerHyperdriveId !== undefined &&
      (typeof exportWorkerHyperdriveId !== "string" || !/^[a-f0-9]{32}$/.test(exportWorkerHyperdriveId) ||
        exportWorkerHyperdriveId === hyperdriveId)) {
    throw new Error("Refusing an invalid separate staging export worker Hyperdrive ID.");
  }
  const proofKeys = ["STAGING_EXPORT_PROOF_APPROVED", "STAGING_EXPORT_PROOF_USER_ID",
    "STAGING_EXPORT_PROOF_BUILD_UNTIL", "STAGING_EXPORT_PROOF_CLEANUP_REVIEW_AFTER"];
  const activationKeys = ["STAGING_EXPORT_ALL_USERS_APPROVED", "STAGING_EXPORT_CLEANUP_ONLY_APPROVED"];
  const proofConfigured = proofKeys.some((key) => exportProofVars[key] !== undefined);
  if (Object.keys(exportProofVars).some((key) => ![...proofKeys, ...activationKeys].includes(key)) ||
      (Object.keys(exportProofVars).length > 0 && !exportWorkerHyperdriveId) ||
      (proofConfigured && (proofKeys.some((key) => typeof exportProofVars[key] !== "string" || !exportProofVars[key]) ||
        exportProofVars.STAGING_EXPORT_PROOF_APPROVED !== "synthetic-only" ||
        activationKeys.some((key) => exportProofVars[key] !== undefined))) ||
      (exportProofVars.STAGING_EXPORT_ALL_USERS_APPROVED !== undefined &&
        exportProofVars.STAGING_EXPORT_ALL_USERS_APPROVED !== "all-staging-accounts") ||
      (exportProofVars.STAGING_EXPORT_CLEANUP_ONLY_APPROVED !== undefined &&
        exportProofVars.STAGING_EXPORT_CLEANUP_ONLY_APPROVED !== "continue-existing-cleanup")) {
    throw new Error("Staging export settings are invalid or incomplete.");
  }
  if (Object.keys(exportProofVars).length > 0 &&
      (!/^[a-f0-9]{32}$/.test(mediaVars.R2_ACCOUNT_ID ?? "") ||
       typeof mediaVars.R2_BUCKET_NAME !== "string" || !mediaVars.R2_BUCKET_NAME)) {
    throw new Error("Staging export execution and cleanup require complete R2 bindings.");
  }
  if (typeof authApiOrigin !== "string" || typeof authWebOrigin !== "string") {
    throw new Error("Staging origins are required.");
  }
  if (typeof browserProxyEnabled !== "boolean") throw new Error("browserProxyEnabled must be boolean.");
  const vars = {
    API_RATE_LIMIT_SCOPE: "staging",
    NOTIFICATION_PUBLISHERS_ENABLED: "false",
    DIRECT_MESSAGE_SEND_LIMIT: "30",
    // The web workflow must use the same reviewed mode. Direct API remains the
    // public origin even when Better Auth moves to the web origin.
    BETTER_AUTH_BASE_URL: browserProxyEnabled ? authWebOrigin : authApiOrigin,
    PUBLIC_API_BASE_URL: authApiOrigin,
    BETTER_AUTH_TRUSTED_ORIGINS: `${authApiOrigin},${authWebOrigin}`,
    ...authVars,
    ...mediaVars,
    ...exportProofVars,
  };
  const api = {
    ...sharedWorkerConfig,
    ...durableObjectConfig,
    name: workerName,
    workers_dev: false,
    observability: { enabled: true },
    ratelimits: rateLimitConfig,
    vars,
    hyperdrive: [{ binding: "HYPERDRIVE", id: hyperdriveId },
      ...(exportWorkerHyperdriveId ? [{ binding: "EXPORT_WORKER_HYPERDRIVE", id: exportWorkerHyperdriveId }] : [])],
  };
  const probe = {
    ...sharedWorkerConfig,
    // The dedicated module exports only the service entrypoint. It cannot
    // publish UserRealtime or require a shared Durable Object namespace.
    main: "src/features/system/hyperdrive/test-worker.ts",
    name: "dayli-api-hyperdrive-integration-test",
    workers_dev: false,
    services: [{
      binding: "STAGING_API",
      service: workerName,
      entrypoint: "HyperdriveIntegrationEntrypoint",
      remote: true,
    }],
  };
  return { api, probe };
}

export function serializeWranglerConfig(config) {
  return `${JSON.stringify(config, null, 2)}\n`;
}
