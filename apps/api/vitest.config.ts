import { cloudflareTest } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [cloudflareTest({ wrangler: { configPath: "./wrangler.jsonc" } })],
  test: {
    include: ["src/features/**/__tests__/**/*.test.ts", "src/**/*.test.ts", "test/**/*.test.ts"],
    exclude: ["**/node_modules/**", "test/**/*.staging.test.ts", "test/**/*.workerd.test.ts", "**/*.integration.test.ts"],
  },
});
