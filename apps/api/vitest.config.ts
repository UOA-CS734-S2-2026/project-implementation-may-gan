import { cloudflareTest } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [cloudflareTest({ wrangler: { configPath: "./wrangler.jsonc" } })],
  test: {
    exclude: ["**/node_modules/**", "test/**/*.staging.test.ts", "**/*.integration.test.ts"],
  },
});
