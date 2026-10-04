import type { ApiEnv } from "../../../env";

// Production execution and normal web and native clients remain disabled.
export const exportExecutionEnabled = false;

const proofUserPattern = /^[A-Za-z0-9_-]{8,128}$/;
const hour = 60 * 60_000;

function timestamp(value: string | undefined): number | null {
  if (!value || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value)) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && new Date(parsed).toISOString() === value ? parsed : null;
}

/** No production variable alone can open this staging-only, time-bounded proof. */
export function readStagingExportProof(env: Partial<ApiEnv>, now = Date.now()): {
  userId: string;
  buildEnabled: boolean;
  cleanupEnabled: boolean;
} | null {
  if (env.API_RATE_LIMIT_SCOPE !== "staging" || env.STAGING_EXPORT_PROOF_APPROVED !== "synthetic-only" ||
      !env.EXPORT_WORKER_HYPERDRIVE) return null;
  const userId = env.STAGING_EXPORT_PROOF_USER_ID;
  const buildUntil = timestamp(env.STAGING_EXPORT_PROOF_BUILD_UNTIL);
  const cleanupReviewAfter = timestamp(env.STAGING_EXPORT_PROOF_CLEANUP_REVIEW_AFTER);
  if (!userId || !proofUserPattern.test(userId) || buildUntil === null || cleanupReviewAfter === null ||
      buildUntil - now > hour || cleanupReviewAfter - now > 73 * hour ||
      cleanupReviewAfter - buildUntil < 48 * hour) return null;
  // This timestamp is an operator checkpoint, not a stop time. Cleanup must
  // continue if the provider is delayed or a retry remains after the second pass.
  return { userId, buildEnabled: now < buildUntil, cleanupEnabled: true };
}
