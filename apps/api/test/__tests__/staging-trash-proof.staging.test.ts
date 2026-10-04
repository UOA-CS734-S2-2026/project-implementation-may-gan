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
    const proof = await awaitRpcDeployment(
      "proveStagingRevision",
      () => env.STAGING_API.proveStagingRevision(),
    );
    expect(proof).toEqual({
      revision: env.EXPECTED_STAGING_RELEASE_SHA,
      storageDigest: env.EXPECTED_STAGING_STORAGE_DIGEST,
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
