import { cloudflareTest } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [cloudflareTest({
    remoteBindings: true,
    wrangler: { configPath: "./wrangler.hyperdrive-test.jsonc" },
  })],
  test: {
    include: ["test/**/*.staging.test.ts"],
    testTimeout: 60_000,
  },
});
