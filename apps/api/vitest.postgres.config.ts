import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/features/**/postgres.integration.test.ts"],
    // Each *.postgres.integration.test.ts file drops/recreates the full shared
    // schema in its own beforeAll against the same live database; they must not
    // run concurrently with each other, or they race creating the same tables/types.
    fileParallelism: false,
  },
});
