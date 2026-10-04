import { cloudflareTest } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

/** Dedicated Workers runtime suite for Durable Object hibernation and upgrade boundaries. */
export default defineConfig({
  plugins: [cloudflareTest({ wrangler: { configPath: "./wrangler.jsonc" } })],
  test: { include: ["test/__tests__/**/*.runtime.test.ts"] },
});
