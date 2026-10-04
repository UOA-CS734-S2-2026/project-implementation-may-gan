#!/usr/bin/env node

const expectedRuntimeRole = "app";
const idPattern = /^[a-f0-9]{32}$/;

function fail(message) {
  throw new Error(`Staging schema target verification failed: ${message}`);
}

function required(environment, name) {
  const value = environment[name];
  if (!value) fail(`the staging environment must provide ${name}.`);
  return value;
}

function normalizeNeonHost(value) {
  if (typeof value !== "string") fail("the Hyperdrive origin host is unavailable.");
  const normalized = value.toLowerCase().replace(/\.$/, "");
  if (!normalized.endsWith(".neon.tech") || normalized.includes("-pooler")) {
    fail("the Hyperdrive origin must be a direct Neon host.");
  }
  return normalized;
}

function validPort(value) {
  return Number.isInteger(value) && value >= 1 && value <= 65_535;
}

export function readDirectMigratorTarget(connectionString) {
  let url;
  try {
    url = new URL(connectionString);
  } catch {
    fail("DATABASE_URL is invalid.");
  }

  if (!['postgres:', 'postgresql:'].includes(url.protocol)) {
    fail("DATABASE_URL must use PostgreSQL.");
  }
  if (url.username !== "migrator") {
    fail("DATABASE_URL must use the migrator role.");
  }

  const host = normalizeNeonHost(url.hostname);
  const database = decodeURIComponent(url.pathname.slice(1));
  if (!database || database.includes("/")) {
    fail("DATABASE_URL must name one database.");
  }

  const port = url.port === "" ? 5432 : Number(url.port);
  if (!validPort(port)) {
    fail("DATABASE_URL must use a valid direct database port.");
  }

  return { host, database, port };
}

export function readHyperdriveTarget(hyperdrive, expectedRole = expectedRuntimeRole) {
  const origin = hyperdrive?.result?.origin;
  if (!origin || typeof origin !== "object") {
    fail("the configured Hyperdrive does not expose a public database origin.");
  }
  if (!['postgres', 'postgresql'].includes(origin.scheme)) {
    fail("the configured Hyperdrive must use PostgreSQL.");
  }
  if (origin.user !== expectedRole) {
    fail(`the configured Hyperdrive must use the restricted ${expectedRole} role.`);
  }
  if (typeof origin.database !== "string" || origin.database.length === 0) {
    fail("the Hyperdrive origin database is unavailable.");
  }
  if (!validPort(origin.port)) {
    fail("the Hyperdrive origin port is unavailable.");
  }

  return {
    host: normalizeNeonHost(origin.host),
    database: origin.database,
    port: origin.port,
  };
}

export function assertMatchingDatabaseTargets(direct, hyperdrive) {
  if (direct.host !== hyperdrive.host || direct.database !== hyperdrive.database || direct.port !== hyperdrive.port) {
    fail("the direct migrator connection does not match the configured Hyperdrive database.");
  }
}

export async function verifyStagingSchemaTarget({ environment = process.env, fetchImpl = fetch }) {
  const accountId = required(environment, "CLOUDFLARE_ACCOUNT_ID");
  const apiToken = required(environment, "CLOUDFLARE_API_TOKEN");
  const hyperdriveId = required(environment, "CLOUDFLARE_STAGING_HYPERDRIVE_ID");
  if (!idPattern.test(accountId) || !idPattern.test(hyperdriveId)) {
    fail("Cloudflare account or Hyperdrive ID is invalid.");
  }

  const direct = readDirectMigratorTarget(required(environment, "DATABASE_URL"));
  let response;
  try {
    response = await fetchImpl(`https://api.cloudflare.com/client/v4/accounts/${accountId}/hyperdrive/configs/${hyperdriveId}`, {
      headers: { Authorization: `Bearer ${apiToken}` },
    });
  } catch {
    fail("Cloudflare Hyperdrive validation could not reach the control plane.");
  }
  if (!response.ok) fail("Cloudflare Hyperdrive validation failed.");

  let hyperdrive;
  try {
    hyperdrive = await response.json();
  } catch {
    fail("Cloudflare Hyperdrive validation returned invalid JSON.");
  }

  assertMatchingDatabaseTargets(direct, readHyperdriveTarget(hyperdrive));
}

async function main() {
  await verifyStagingSchemaTarget({});
  console.log("Staging direct migration target matches the configured Hyperdrive database.");
}

if (import.meta.main) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : "Staging schema target verification failed.");
    process.exitCode = 1;
  });
}
