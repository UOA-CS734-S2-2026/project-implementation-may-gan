const sharedWorkerConfig = {
  $schema: "node_modules/wrangler/config-schema.json",
  main: "src/index.ts",
  compatibility_date: "2026-03-10",
  compatibility_flags: ["nodejs_compat"],
};

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
  authApiOrigin,
  authWebOrigin,
  authVars = {},
  mediaVars = {},
}) {
  if (typeof workerName !== "string" || !/^dayli-api-staging$/.test(workerName)) {
    throw new Error("Refusing an unexpected staging Worker name.");
  }
  if (typeof hyperdriveId !== "string" || !/^[a-f0-9]{32}$/.test(hyperdriveId)) {
    throw new Error("Refusing an invalid staging Hyperdrive ID.");
  }
  if (typeof authApiOrigin !== "string" || typeof authWebOrigin !== "string") {
    throw new Error("Staging origins are required.");
  }
  const vars = {
    BETTER_AUTH_BASE_URL: authApiOrigin,
    BETTER_AUTH_TRUSTED_ORIGINS: `${authApiOrigin},${authWebOrigin}`,
    ...authVars,
    ...mediaVars,
  };
  const api = {
    ...sharedWorkerConfig,
    ...durableObjectConfig,
    name: workerName,
    workers_dev: false,
    observability: { enabled: true },
    vars,
    hyperdrive: [{ binding: "HYPERDRIVE", id: hyperdriveId }],
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
