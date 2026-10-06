import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

interface HyperdriveIntegrationService {
  diagnoseOAuthEgress: () => Promise<import("../../src/infrastructure/push/oauth-egress-probe").OAuthEgressProof>;
  diagnoseOAuthEgressMatrix: () => Promise<import("../../src/infrastructure/push/oauth-egress-probe").EgressMatrixRow[]>;
  diagnoseNotificationRuntime: () => ReturnType<typeof import("../../src/infrastructure/push/notification-runtime-proof").notificationRuntimeProof>;
  proveConnection: () => Promise<{ ok: 1 }>;
  proveTransactions: (group: string) => Promise<{
    appRole: boolean;
    isolationLevel: string;
    serverVersion: string;
    committed: boolean;
    rolledBack: boolean;
    committedRow: string;
    rolledBackRow: string;
    constraints: Record<"unique" | "foreign_key" | "check" | "not_null", string>;
    updateDenied: boolean;
    ddlDenied: boolean;
  }>;
  verifyTransactions: (group: string, committedRow: string, rolledBackRow: string) => Promise<{
    committedVisible: boolean;
    rolledBackAbsent: boolean;
    cleanup: boolean;
  }>;
  proveStagingRevision: () => Promise<{ revision: string; storageDigest: string }>;
  provePostTrashCleanupAdmission: () => Promise<import("../../src/infrastructure/jobs/post-trash-runtime").PostTrashCleanupAdmissionProof>;
  provePostTrashWorkerFence: () => Promise<{
    appRoleDenied: boolean;
    lifecycleWorkerRole: boolean;
    aggregateReadable: boolean;
    due: number;
    failed: number;
    leased: number;
  }>;
}

declare global {
  // Cloudflare.Env is a global interface, so its test binding needs an ambient namespace merge.
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Cloudflare {
    interface Env {
      STAGING_API: HyperdriveIntegrationService;
    }
  }
}

describe("staging Hyperdrive", () => {
  it("runs select 1 through Drizzle in the staging Worker", async () => {
    await expect(env.STAGING_API.proveConnection()).resolves.toEqual({ ok: 1 });
  });

  it("proves transactions, constraints, authorization, and fresh-invocation visibility", async () => {
    const group = crypto.randomUUID();
    const proof = await env.STAGING_API.proveTransactions(group);

    expect(proof).toMatchObject({
      appRole: true,
      committed: true,
      rolledBack: true,
      constraints: { unique: "unique", foreign_key: "foreign_key", check: "check", not_null: "not_null" },
      updateDenied: true,
      ddlDenied: true,
    });
    const visibility = await env.STAGING_API.verifyTransactions(group, proof.committedRow, proof.rolledBackRow);
    expect(visibility).toEqual({ committedVisible: true, rolledBackAbsent: true, cleanup: true });
    expect(proof.isolationLevel).not.toBe("");
    expect(proof.serverVersion).not.toBe("");
  });
});
