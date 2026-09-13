import { defineWorkersConfig } from "@cloudflare/vitest-pool-workers/config";

export default defineWorkersConfig({
  test: {
    include: ["test/**/*.staging.test.ts"],
    poolOptions: {
      workers: {
        remoteBindings: true,
        wrangler: { configPath: "./wrangler.hyperdrive-test.jsonc" },
      },
    },
  },
});
