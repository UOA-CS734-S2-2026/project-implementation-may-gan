import { writeFileSync } from "node:fs";
import { createStagingAttestationExpectations } from "./staging-worker-config.mjs";

export function createStagingTrashProofProbe({ targetSha, serviceName, storageAccountId, storageBucketName }) {
  if (serviceName !== "dayli-api-staging") throw new Error("Refusing an unexpected staging API service.");
  const attestationVars = createStagingAttestationExpectations({
    releaseSha: targetSha,
    mediaVars: { R2_ACCOUNT_ID: storageAccountId, R2_BUCKET_NAME: storageBucketName },
  });
  return {
    $schema: "node_modules/wrangler/config-schema.json",
    main: "src/features/system/hyperdrive/test-worker.ts",
    compatibility_date: "2026-03-10",
    compatibility_flags: ["nodejs_compat"],
    name: "dayli-api-staging-trash-proof",
    workers_dev: false,
    vars: attestationVars,
    services: [{
      binding: "STAGING_API",
      service: serviceName,
      entrypoint: "HyperdriveIntegrationEntrypoint",
      remote: true,
    }],
  };
}

if (import.meta.main) {
  const config = createStagingTrashProofProbe({
    targetSha: process.env.TARGET_SHA,
    serviceName: process.env.STAGING_API_SERVICE_NAME,
    storageAccountId: process.env.CLOUDFLARE_ACCOUNT_ID,
    storageBucketName: process.env.STAGING_R2_BUCKET_NAME,
  });
  writeFileSync("apps/api/wrangler.staging-trash-proof.jsonc", `${JSON.stringify(config, null, 2)}\n`);
  console.log("Private staging Trash proof probe configured.");
}
