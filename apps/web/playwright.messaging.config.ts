import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/messaging-polish.spec.ts",
  fullyParallel: true,
  use: { baseURL: "http://127.0.0.1:3101", trace: "retain-on-failure" },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["iPhone 13"], browserName: "chromium" } },
  ],
  webServer: {
    command: "E2E_MESSAGING=1 NEXT_PUBLIC_API_BASE_URL=https://localhost:8787 pnpm dev --port 3101",
    url: "http://127.0.0.1:3101/e2e/messaging",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
