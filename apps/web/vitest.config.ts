import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: { "@": import.meta.dirname, "server-only": `${import.meta.dirname}/test/server-only.ts` } },
  test: {
    environment: "jsdom",
    setupFiles: ["./test/setup.ts"],
    include: ["**/*.test.ts?(x)"],
  },
});
