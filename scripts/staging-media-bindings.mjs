import { AwsClient } from "aws4fetch";

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

/**
 * Prove the bucket exists and the Worker's own S3 keys can reach it before
 * deploying, so a typo, a deleted bucket, or wrong/revoked keys fail here
 * instead of as presigned PUTs that R2 rejects. This deliberately uses the
 * bucket-scoped R2 keys: checking through the Cloudflare REST API would need
 * account-wide R2 read on the deploy token, which reaches every bucket's
 * objects. The URL and signed headers are never logged.
 */
export async function assertStagingR2BucketAccess(
  { accountId, bucketName, accessKeyId, secretAccessKey },
  client = new AwsClient({ accessKeyId, secretAccessKey, service: "s3", region: "auto" }),
) {
  let response;
  try {
    response = await client.fetch(`https://${accountId}.r2.cloudflarestorage.com/${bucketName}?list-type=2&max-keys=1`);
  } catch {
    throw new Error("Staging R2 validation could not reach R2.");
  }
  await response.body?.cancel();
  if (response.status === 404) {
    throw new Error("STAGING_R2_BUCKET_NAME is not a bucket in the staging Cloudflare account.");
  }
  if (response.status === 401 || response.status === 403) {
    throw new Error("R2_ACCESS_KEY_ID and R2_SECRET_ACCESS_KEY cannot list STAGING_R2_BUCKET_NAME. Check the keys and the token's bucket scope.");
  }
  if (!response.ok) throw new Error(`Staging R2 validation failed (HTTP ${response.status}).`);
}
