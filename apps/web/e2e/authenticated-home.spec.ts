import { expect, test } from "@playwright/test";

test("a person can sign up, leave, and return to their account", async ({ page }, testInfo) => {
  const suffix = testInfo.project.name.replace(/[^a-z0-9]/gi, "").toLowerCase();
  const username = `e2e${suffix}`;
  const email = `${username}@example.test`;
  const password = "e2e-password-123";

  await page.goto("/");
  await page.getByRole("link", { name: /sign up/i }).click();
  await expect(page).toHaveURL(/\/sign-up$/);

  await page.getByLabel("Username").fill(username);
  await page.getByLabel("Public name (optional)").fill(`E2E ${testInfo.project.name}`);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Let's go" }).click();

  await expect(page).toHaveURL(/\/home$/);
  await page.goto("/");
  await expect(page).toHaveURL(/\/home$/);

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
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).not.toHaveURL(/\/settings$/);
  await page.goto("/settings");
  await expect(page).toHaveURL(/\/sign-in(?:\?|$)/);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/home$/);
  await page.goto("/settings");
  await page.reload();
  await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
  await expect(page.getByText(email, { exact: true }).last()).toBeVisible();
});
