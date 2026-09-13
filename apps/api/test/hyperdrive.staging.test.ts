import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";

interface HyperdriveIntegrationService {
  proveConnection: () => Promise<{ ok: 1 }>;
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
});
