import { cloudflareTest } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [cloudflareTest({
    remoteBindings: true,
    wrangler: { configPath: "./wrangler.staging-trash-proof.jsonc" },
  })],
  test: {
    include: ["test/__tests__/staging-trash-proof.staging.test.ts"],
    testTimeout: 60_000,
  },
});
