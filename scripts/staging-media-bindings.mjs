export const r2WorkerSecretNames = Object.freeze(["R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY"]);

// R2 bucket naming rules: 3-63 lowercase letters, digits, and hyphens, starting
// and ending with a letter or digit.
const bucketNamePattern = /^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/;

/**
 * Read the public R2 bindings for media reservations. Like the auth providers,
 * R2 is either completely absent or complete: a bucket without its S3 keys (or
 * keys without a bucket) fails the deploy instead of shipping a Worker whose
 * media routes 503 in a way nobody notices. Absent keeps them deliberately 503.
 * The bucket lives in the same Cloudflare account the deploy already targets.
 */
export function readStagingMediaBindings(environment, accountId) {
  const bucketName = environment.STAGING_R2_BUCKET_NAME;
  if (bucketName === undefined || bucketName === "") return { vars: {}, requiredSecrets: [] };
  if (typeof bucketName !== "string" || !bucketNamePattern.test(bucketName)) {
    throw new Error("STAGING_R2_BUCKET_NAME must be a valid R2 bucket name.");
  }
  if (typeof accountId !== "string" || !/^[a-f0-9]{32}$/.test(accountId)) {
    throw new Error("Refusing an invalid Cloudflare account ID for R2.");
  }
  return {
    vars: { R2_ACCOUNT_ID: accountId, R2_BUCKET_NAME: bucketName },
    requiredSecrets: [...r2WorkerSecretNames],
  };
}
