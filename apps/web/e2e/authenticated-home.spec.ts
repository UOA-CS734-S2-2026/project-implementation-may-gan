import { execFileSync } from "node:child_process";
import { expect, test } from "@playwright/test";
import { acceptRequiredLegalConsent, signUpAcceptedApiFixture, signUpWithExplicitConsent } from "./support/legal-consent";

function database(query: string): void {
  execFileSync("docker", ["exec", process.env.E2E_POSTGRES_CONTAINER!, "psql", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "dayli_test", "-c", query], { stdio: "pipe" });
}

test("a person can sign up, leave, and return to their account", async ({ page }, testInfo) => {
  const suffix = testInfo.project.name.replace(/[^a-z0-9]/gi, "").toLowerCase();
  const username = `e2e${suffix}`;
  const email = `${username}@example.test`;
  const password = "e2e-password-123";

  await page.goto("/");
  const signUpLink = page.getByRole("link", { name: /sign up/i });
  await expect(signUpLink).toHaveAttribute("href", "/sign-up");
  await Promise.all([
    page.waitForURL(/\/sign-up$/, { waitUntil: "domcontentloaded" }),
    signUpLink.click(),
  ]);
  await expect(page).toHaveURL(/\/sign-up$/);

  await signUpWithExplicitConsent(page, {
    username, publicName: `E2E ${testInfo.project.name}`, email, password,
  });

  if (testInfo.project.name === "mobile-chromium") {
    await page.locator('label[for="mobile-nav-toggle"]').first().click();
    await expect(page.getByText(email, { exact: true }).last()).toBeVisible();
    await expect(page.getByRole("link", { name: /^friends$/i })).toBeVisible();
    await page.getByRole("link", { name: /^friends$/i }).click();
    await expect(page.getByRole("heading", { name: "friends" })).toBeVisible();
  } else {
    await expect(page.getByText(email, { exact: true }).first()).toBeVisible();
    await expect(page.getByRole("link", { name: /^daylies$/i })).toBeVisible();
    await expect(page.getByRole("link", { name: /^friends$/i })).toBeVisible();
  }

  // Settings has no navigation link yet, so enter its URL without bypassing auth.
  await page.goto("/settings");
  await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();

  let exportApiCalls = 0;
  page.on("request", (request) => {
    if (/\/api\/v1\/account\/export(?:\/|\?|$)/.test(request.url())) exportApiCalls++;
  });
  await page.goto("/account/export");
  await expect(page.getByText("Account exports are not available yet.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Request export" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: /download/i })).toHaveCount(0);
  expect(exportApiCalls).toBe(0);

  await page.goto("/settings");
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).not.toHaveURL(/\/settings$/);
  await page.goto("/settings");
  await expect(page).toHaveURL(/\/sign-in(?:\?|$)/);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  // The route guard supplies the protected destination as a validated return path.
  await expect(page).toHaveURL(/\/settings$/);
  await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
  await expect(page.getByText(email, { exact: true }).last()).toBeVisible();
});

test("a blocked existing account explicitly accepts the current legal policy", async ({ page }, testInfo) => {
  const suffix = `${testInfo.project.name}-${Date.now()}`.replace(/[^a-z0-9]/gi, "").toLowerCase().slice(-18);
  const account = {
    username: `legal${suffix}`,
    publicName: "Legal Gate E2E",
    email: `legal${suffix}@example.test`,
    password: "e2e-password-123",
  };
  await signUpAcceptedApiFixture(page, account);

  database(`delete from age_declarations where user_id = (select id from "user" where username = '${account.username}'); delete from terms_acceptances where user_id = (select id from "user" where username = '${account.username}')`);
  await page.request.post(`${process.env.E2E_API_ORIGIN}/api/auth/sign-out`);
  await page.context().clearCookies();

  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(account.email);
  await page.getByLabel("Password").fill(account.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/legal\/acceptance(?:\?|$)/);
  await acceptRequiredLegalConsent(page);
});
