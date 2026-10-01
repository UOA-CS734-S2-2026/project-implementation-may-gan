import assert from "node:assert/strict";
import test from "node:test";
import { readDirectMigratorTarget, readHyperdriveTarget, verifyStagingSchemaTarget } from "./verify-staging-schema-target.mjs";

const accountId = "a".repeat(32);
const hyperdriveId = "b".repeat(32);
const directUrl = "postgresql://migrator:password@ep-staging-123.us-east-2.aws.neon.tech/neondb?sslmode=require";

function environment(databaseUrl = directUrl) {
  return {
    CLOUDFLARE_ACCOUNT_ID: accountId,
    CLOUDFLARE_API_TOKEN: "runner-token",
    CLOUDFLARE_STAGING_HYPERDRIVE_ID: hyperdriveId,
    DATABASE_URL: databaseUrl,
  };
}

function hyperdrive({ host = "EP-STAGING-123.US-EAST-2.AWS.NEON.TECH.", database = "neondb", port = 5432, user = "app" } = {}) {
  return {
    success: true,
    result: {
      origin: { scheme: "postgresql", host, database, port, user },
    },
  };
}

function fetchHyperdrive(result) {
  return async (url, options) => {
    assert.equal(url, `https://api.cloudflare.com/client/v4/accounts/${accountId}/hyperdrive/configs/${hyperdriveId}`);
    assert.equal(options.headers.Authorization, "Bearer runner-token");
    return new Response(JSON.stringify(result), { status: 200 });
  };
}

test("accepts the direct migrator URL when Hyperdrive uses app against the same database", async () => {
  await assert.doesNotReject(verifyStagingSchemaTarget({
    environment: environment(), fetchImpl: fetchHyperdrive(hyperdrive()),
  }));
});

test("rejects a Hyperdrive host, database, or port that differs from the direct migrator target", async () => {
  for (const result of [
    hyperdrive({ host: "ep-other.us-east-2.aws.neon.tech" }),
    hyperdrive({ database: "otherdb" }),
    hyperdrive({ port: 5433 }),
  ]) {
    await assert.rejects(
      verifyStagingSchemaTarget({ environment: environment(), fetchImpl: fetchHyperdrive(result) }),
      /does not match the configured Hyperdrive database/,
    );
  }
});

test("rejects proxy hosts and does not assume an unspecified Hyperdrive port", () => {
  assert.throws(
    () => readDirectMigratorTarget("postgresql://migrator:password@ep-staging-pooler.us-east-2.aws.neon.tech/neondb?sslmode=require"),
    /direct Neon host/,
  );
  const withoutPort = hyperdrive();
  delete withoutPort.result.origin.port;
  assert.throws(
    () => readHyperdriveTarget(withoutPort),
    /origin port is unavailable/,
  );
});

test("does not accept a migrator identity for the Worker Hyperdrive origin", () => {
  assert.throws(
    () => readHyperdriveTarget(hyperdrive({ user: "migrator" })),
    /restricted app role/,
  );
});

test("does not leak direct connection or control-plane secrets on failures", async () => {
  const secretUrl = "postgresql://migrator:private-password@ep-staging-123.us-east-2.aws.neon.tech/neondb?sslmode=require";
  await assert.rejects(
    verifyStagingSchemaTarget({ environment: environment(secretUrl), fetchImpl: async () => { throw new Error("runner-token"); } }),
    (error) => !error.message.includes("private-password") && !error.message.includes("runner-token") && !error.message.includes("neon.tech"),
  );
});
