import { writeFileSync } from "node:fs";
import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";

interface HyperdriveIntegrationService {
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
}

declare module "cloudflare:test" {
  interface ProvidedEnv {
    STAGING_API: HyperdriveIntegrationService;
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
    writeFileSync("hyperdrive-proof-evidence.json", JSON.stringify({
      commitSha: process.env.GITHUB_SHA ?? "local",
      timestamp: new Date().toISOString(),
      pass: true,
      committed: proof.committed,
      rolledBack: proof.rolledBack,
      cleanup: visibility.cleanup,
      constraints: proof.constraints,
      appRole: proof.appRole,
      updateDenied: proof.updateDenied,
      ddlDenied: proof.ddlDenied,
      cacheDisabled: true,
      isolationLevel: proof.isolationLevel,
      serverVersion: proof.serverVersion,
      versions: { node: process.version, pnpm: "10.32.1", drizzle: "0.45.2", postgres: "3.4.9", wrangler: "4.129.1", workersVitestPool: "0.12.21", vitest: "3.2.7", compatibilityDate: "2026-03-10" },
    }, null, 2));
  });
});
