import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: [
      "src/features/**/postgres.integration.test.ts",
      "src/features/permissions/**/*.test.ts",
    ],
    fileParallelism: false,
  },
});
