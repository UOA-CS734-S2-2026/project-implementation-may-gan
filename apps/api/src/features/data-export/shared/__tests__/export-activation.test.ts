import { describe, expect, it } from "vitest";
import { exportExecutionEnabled, readStagingExportProof, stagingExportAllUsersEnabled,
  stagingExportCleanupOnlyEnabled } from "../export-activation";

const now = Date.parse("2026-10-04T00:00:00.000Z");
const binding = { connectionString: "postgres://synthetic.test" };
const proof = {
  API_RATE_LIMIT_SCOPE: "staging",
  EXPORT_WORKER_HYPERDRIVE: binding,
  STAGING_EXPORT_PROOF_APPROVED: "synthetic-only",
  STAGING_EXPORT_PROOF_USER_ID: "synthetic-owner-123",
  STAGING_EXPORT_PROOF_BUILD_UNTIL: "2026-10-04T00:30:00.000Z",
  STAGING_EXPORT_PROOF_CLEANUP_REVIEW_AFTER: "2026-10-06T01:00:00.000Z",
};

describe("staging-only synthetic export gate", () => {
  it("admits all staging accounts only with a separate binding and exact owner approval", () => {
    const active = { API_RATE_LIMIT_SCOPE: "staging", EXPORT_WORKER_HYPERDRIVE: binding,
      STAGING_EXPORT_ALL_USERS_APPROVED: "all-staging-accounts" };
    expect(stagingExportAllUsersEnabled(active)).toBe(true);
    expect(stagingExportAllUsersEnabled({ ...active, API_RATE_LIMIT_SCOPE: "production" })).toBe(false);
    expect(stagingExportAllUsersEnabled({ ...active, EXPORT_WORKER_HYPERDRIVE: undefined })).toBe(false);
    expect(stagingExportAllUsersEnabled({ ...active, STAGING_EXPORT_ALL_USERS_APPROVED: "true" })).toBe(false);
    expect(stagingExportCleanupOnlyEnabled({ ...active, STAGING_EXPORT_CLEANUP_ONLY_APPROVED: "continue-existing-cleanup" })).toBe(true);
    expect(stagingExportCleanupOnlyEnabled({ ...active, API_RATE_LIMIT_SCOPE: "production",
      STAGING_EXPORT_CLEANUP_ONLY_APPROVED: "continue-existing-cleanup" })).toBe(false);
  });
  it("never enables normal or production execution", () => {
    expect(exportExecutionEnabled).toBe(false);
    expect(readStagingExportProof({ ...proof, API_RATE_LIMIT_SCOPE: "production" }, now)).toBeNull();
    expect(readStagingExportProof({ ...proof, STAGING_EXPORT_PROOF_APPROVED: undefined }, now)).toBeNull();
    expect(readStagingExportProof({ ...proof, EXPORT_WORKER_HYPERDRIVE: undefined }, now)).toBeNull();
    expect(readStagingExportProof({}, now)).toBeNull();
  });

  it("keeps cleanup available at and after its review checkpoint", () => {
    expect(readStagingExportProof(proof, now)).toEqual({ userId: "synthetic-owner-123", buildEnabled: true, cleanupEnabled: true });
    expect(readStagingExportProof(proof, now + 31 * 60_000)).toEqual({ userId: "synthetic-owner-123", buildEnabled: false, cleanupEnabled: true });
    expect(readStagingExportProof(proof, Date.parse(proof.STAGING_EXPORT_PROOF_CLEANUP_REVIEW_AFTER)))
      .toEqual({ userId: "synthetic-owner-123", buildEnabled: false, cleanupEnabled: true });
    expect(readStagingExportProof(proof, Date.parse(proof.STAGING_EXPORT_PROOF_CLEANUP_REVIEW_AFTER) + 60_000))
      .toEqual({ userId: "synthetic-owner-123", buildEnabled: false, cleanupEnabled: true });
  });

  it("rejects malformed owner IDs and excessive or invalid windows", () => {
    expect(readStagingExportProof({ ...proof, STAGING_EXPORT_PROOF_USER_ID: " owner " }, now)).toBeNull();
    expect(readStagingExportProof({ ...proof, STAGING_EXPORT_PROOF_BUILD_UNTIL: "tomorrow" }, now)).toBeNull();
    expect(readStagingExportProof({ ...proof, STAGING_EXPORT_PROOF_BUILD_UNTIL: "2026-10-04T02:00:00.000Z" }, now)).toBeNull();
    expect(readStagingExportProof({ ...proof, STAGING_EXPORT_PROOF_CLEANUP_REVIEW_AFTER: "2026-10-05T00:00:00.000Z" }, now)).toBeNull();
    expect(readStagingExportProof({ ...proof, STAGING_EXPORT_PROOF_CLEANUP_REVIEW_AFTER: "2026-10-10T00:00:00.000Z" }, now)).toBeNull();
  });
});
