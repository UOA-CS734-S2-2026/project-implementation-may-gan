import { createHash } from "node:crypto";
import { writeFileSync } from "node:fs";

const shaPattern = /^[a-f0-9]{40}$/;

export function createStagingTrashProofProbe({ targetSha, serviceName, storageAccountId, storageBucketName }) {
  if (!shaPattern.test(targetSha ?? "")) throw new Error("The staging Trash proof target must be an exact commit SHA.");
  if (serviceName !== "dayli-api-staging") throw new Error("Refusing an unexpected staging API service.");
  if (!/^[a-f0-9]{32}$/.test(storageAccountId ?? "") ||
      !/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(storageBucketName ?? "")) {
    throw new Error("Refusing invalid staging proof storage metadata.");
  }
  const storageDigest = createHash("sha256").update(`${storageAccountId}\n${storageBucketName}`).digest("hex");
  return {
    $schema: "node_modules/wrangler/config-schema.json",
    main: "src/features/system/hyperdrive/test-worker.ts",
    compatibility_date: "2026-03-10",
    compatibility_flags: ["nodejs_compat"],
    name: "dayli-api-staging-trash-proof",
    workers_dev: false,
    vars: { EXPECTED_STAGING_RELEASE_SHA: targetSha, EXPECTED_STAGING_STORAGE_DIGEST: storageDigest },
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
