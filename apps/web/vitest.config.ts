import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": import.meta.dirname,
      "server-only": `${import.meta.dirname}/test/server-only.ts`,
      // Match the tsconfig paths, so tests use workspace sources without a package build.
      "@dayli/api-client": `${import.meta.dirname}/../../packages/api-client-typescript/src/index.ts`,
      "@dayli/legal-content": `${import.meta.dirname}/../../packages/legal-content/index.ts`,
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./test/setup.ts"],
    include: ["**/*.test.ts?(x)"],
  },
});
