import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    fileParallelism: false,
    include: [
      "src/features/**/__tests__/**/*.integration.test.ts",
      "src/features/permissions/__tests__/**/*.test.ts",
      "src/infrastructure/**/__tests__/**/*.integration.test.ts",
    ],
  },
});
