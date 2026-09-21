import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: [
      "src/features/auth/postgres.integration.test.ts",
      "src/features/permissions/**/*.test.ts",
    ],
  },
});
