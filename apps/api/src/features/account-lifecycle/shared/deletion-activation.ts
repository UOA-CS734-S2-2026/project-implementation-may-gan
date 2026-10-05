import type { ApiEnv } from "../../../env";

const stagingOrigin = "https://api.staging.dayli.agroupforcoders.com";

export type DeletionRequestActivation =
  | { enabled: false }
  | { enabled: true; allowedUserId: string };

/**
 * Account deletion requests are intentionally narrower than export staging.
 * This is an explicit, single-owner staging admission, not a production flag.
 * Keeping all literals exact makes a missing, stale, or copied secret inert.
 */
export function readDeletionRequestActivation(
  env: Pick<ApiEnv,
    | "STAGING_ACCOUNT_DELETION_APPROVED"
    | "STAGING_ACCOUNT_DELETION_PROOF_APPROVED"
    | "STAGING_ACCOUNT_DELETION_PURGE_PROVEN"
    | "STAGING_ACCOUNT_DELETION_PROOF_USER_ID"
  >,
  publicApiBaseUrl: string,
): DeletionRequestActivation {
  // Auth may run on the web origin when browser proxy mode is enabled. The
  // staging admission is about the direct API that owns deletion processing.
  if (publicApiBaseUrl !== stagingOrigin) return { enabled: false };
  if (env.STAGING_ACCOUNT_DELETION_APPROVED !== "request-deletion-staging") return { enabled: false };
  if (env.STAGING_ACCOUNT_DELETION_PROOF_APPROVED !== "owner-flow-reviewed") return { enabled: false };
  if (env.STAGING_ACCOUNT_DELETION_PURGE_PROVEN !== "purge-subsystem-proven") return { enabled: false };
  const allowedUserId = env.STAGING_ACCOUNT_DELETION_PROOF_USER_ID;
  if (!allowedUserId || allowedUserId.length > 255) return { enabled: false };
  return { enabled: true, allowedUserId };
}
