#!/usr/bin/env node

import { assertStagingR2BucketAccess, readStagingMediaBindings } from "./staging-media-bindings.mjs";

export async function verifyStagingTrashProofStorage(environment = process.env) {
  const accountId = environment.CLOUDFLARE_ACCOUNT_ID;
  const bindings = readStagingMediaBindings(environment, accountId);
  if (!bindings.vars.R2_ACCOUNT_ID || !bindings.vars.R2_BUCKET_NAME || bindings.requiredSecrets.length !== 2 ||
      !environment.R2_ACCESS_KEY_ID || !environment.R2_SECRET_ACCESS_KEY) {
    throw new Error("Staging Trash proof storage configuration is incomplete.");
  }
  await assertStagingR2BucketAccess({
    accountId: bindings.vars.R2_ACCOUNT_ID,
    bucketName: bindings.vars.R2_BUCKET_NAME,
    accessKeyId: environment.R2_ACCESS_KEY_ID,
    secretAccessKey: environment.R2_SECRET_ACCESS_KEY,
  });
}

if (import.meta.main) {
  verifyStagingTrashProofStorage().then(
    () => console.log("Staging Trash proof storage metadata verified."),
    () => { console.error("Staging Trash proof storage preflight failed."); process.exitCode = 1; },
  );
}
