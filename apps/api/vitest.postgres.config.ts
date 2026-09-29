import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    fileParallelism: false,
    include: [
      "src/features/**/postgres.integration.test.ts",
      "src/features/**/__tests__/**/*.repository.integration.test.ts",
      "src/features/**/*.repository.integration.test.ts",
      "src/features/permissions/**/*.test.ts",
      "src/infrastructure/**/*.integration.test.ts",
    ],
  },
});
