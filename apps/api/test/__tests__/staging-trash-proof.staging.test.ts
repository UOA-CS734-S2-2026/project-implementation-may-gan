import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { awaitRpcDeployment } from "../rpc-deployment-readiness";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Cloudflare {
    interface Env {
      EXPECTED_STAGING_RELEASE_SHA: string;
      EXPECTED_STAGING_STORAGE_DIGEST: string;
    }
  }
}

describe("private staging Trash attestation", () => {
  it("matches the exact deployed revision", async () => {
    expect(env.EXPECTED_STAGING_RELEASE_SHA).toMatch(/^[a-f0-9]{40}$/);
    expect(env.EXPECTED_STAGING_STORAGE_DIGEST).toMatch(/^[a-f0-9]{64}$/);
    const proof = await awaitRpcDeployment(
      "proveStagingRevision",
      () => env.STAGING_API.proveStagingRevision(),
    );
    expect(proof).toEqual({
      revision: env.EXPECTED_STAGING_RELEASE_SHA,
      storageDigest: env.EXPECTED_STAGING_STORAGE_DIGEST,
    });
  });

  it("reports the private runtime configuration and fixed connectivity matrix", async () => {
    const configuration = await env.STAGING_API.diagnoseNotificationRuntime();
    for (const [key, value] of Object.entries(configuration)) {
      if (key === "revocationBindingFailure") expect(["none", "realtime_missing", "app_database_missing_or_invalid", "worker_database_missing_or_invalid", "database_bindings_identical", "worker_role_invalid"]).toContain(value);
      else expect(typeof value).toBe("boolean");
    }
    const rows = await env.STAGING_API.diagnoseOAuthEgressMatrix();
    expect(rows.map((row) => row.probe)).toEqual(["oauth_post_unbound", "oauth_post_bound", "oauth_form_unbound", "oauth_form_bound", "oauth_get_bound", "oauth_post_manual_redirect", "google_control", "cloudflare_control"]);
    for (const row of rows) {
      expect(["response_received", "transport_failed", "timed_out", "response_invalid"]).toContain(row.outcome);
      expect(Number.isInteger(row.elapsedMs) && row.elapsedMs >= 0 && row.elapsedMs <= 60_000).toBe(true);
      if (row.outcome === "response_received") expect(Number.isInteger(row.httpStatus) && row.httpStatus >= 100 && row.httpStatus <= 599).toBe(true);
    }
    console.info("staging notification diagnostic batch", { configuration, egress: rows });
  }, 15_000);

  it("reports credential-free Google OAuth connectivity without making it a delivery readiness gate", async () => {
    const proof = await env.STAGING_API.diagnoseOAuthEgress();
    expect(["response_received", "transport_failed", "timed_out", "response_invalid"]).toContain(proof.outcome);
    if (proof.outcome === "response_received") {
      expect(Number.isInteger(proof.httpStatus) && proof.httpStatus >= 100 && proof.httpStatus <= 599).toBe(true);
      console.info("staging OAuth egress diagnostics", { outcome: proof.outcome, httpStatus: proof.httpStatus });
    } else if (proof.outcome === "transport_failed") {
      expect(["connection_lost", "connection_refused", "dns_failure", "tls_failure", "timeout", "subrequest_limit", "cross_request_io", "invalid_invocation", "redirect_failed", "unknown"]).toContain(proof.transportReason);
      console.info("staging OAuth egress diagnostics", { outcome: proof.outcome, transportReason: proof.transportReason });
    } else {
      console.info("staging OAuth egress diagnostics", { outcome: proof.outcome });
    }
  });

  it("admits cleanup only from the authoritative lifecycle worker session", async () => {
    const proof = await awaitRpcDeployment(
      "provePostTrashCleanupAdmission",
      () => env.STAGING_API.provePostTrashCleanupAdmission(),
    );
    expect(proof).toEqual({
      structuralDependencies: true,
      connectionStringNamesLifecycleWorker: expect.any(Boolean),
      authoritativeWorkerRole: true,
      runtimeAdmitted: true,
    });
  });

  it("proves aggregate access only through lifecycle_worker", async () => {
    const proof = await awaitRpcDeployment(
      "provePostTrashWorkerFence",
      () => env.STAGING_API.provePostTrashWorkerFence(),
    );
    expect(proof).toMatchObject({
      appRoleDenied: true,
      lifecycleWorkerRole: true,
      aggregateReadable: true,
    });
    for (const count of [proof.due, proof.failed, proof.leased]) {
      expect(Number.isSafeInteger(count)).toBe(true);
      expect(count).toBeGreaterThanOrEqual(0);
    }
  });
});
