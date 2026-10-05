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
