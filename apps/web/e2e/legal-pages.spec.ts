import { expect, test } from "@playwright/test";

async function expectDraftDocument(page: import("@playwright/test").Page, title: string, version: string) {
  await expect(page).toHaveURL(new RegExp(`/${title === "Privacy Policy" ? "privacy" : "terms"}$`));
  await expect(page.getByRole("heading", { name: title })).toBeVisible();
  await expect(page.getByRole("status")).toContainText("Draft, not approved for publication.");
  await expect(page.getByText(`Version: ${version}`)).toBeVisible();
  await expect(page.getByText(/This is a working draft for review/i)).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "default");
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
}

test("public draft policies remain readable across direct URLs, links, and browser navigation", async ({ page }) => {
  await page.goto("/privacy");
  await expectDraftDocument(page, "Privacy Policy", "draft-2");
  await expect(page.getByText(/agroupforcoders@gmail\.com/i).first()).toBeVisible();
  await page.getByRole("link", { name: "Read the draft Terms of Service" }).click();
  await expectDraftDocument(page, "Terms of Service", "draft-2");
  await page.getByRole("link", { name: "Read the draft Privacy Policy" }).click();
  await expectDraftDocument(page, "Privacy Policy", "draft-2");

  await page.goto("/");
  await page.getByRole("link", { name: "Privacy Policy" }).last().click();
  await expectDraftDocument(page, "Privacy Policy", "draft-2");
  await page.goBack();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("link", { name: "Sign up" })).toBeVisible();
});

test("legal pages preserve a draft auth form and stay public after session loss", async ({ page }) => {
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill("reader@example.test");
  await page.getByLabel("Password").fill("not-submitted");
  await page.getByRole("link", { name: "Privacy Policy" }).click();
  await expectDraftDocument(page, "Privacy Policy", "draft-2");
  await page.goBack();
  await expect(page).toHaveURL(/\/sign-in$/);
  await expect(page.getByLabel("Email")).toHaveValue("reader@example.test");
  await expect(page.getByLabel("Password")).toHaveValue("not-submitted");

  await page.context().clearCookies();
  await page.goto("/terms");
  await expectDraftDocument(page, "Terms of Service", "draft-2");
});

test("a signed-in person can read the draft policies from Settings without a redirect", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "mobile-chromium", "The disposable API rate-limit fixture permits three registrations per run.");
  const suffix = testInfo.project.name.replace(/[^a-z0-9]/gi, "").toLowerCase();
  const username = `legale2e${suffix}`;
  const email = `${username}@example.test`;
  const password = "e2e-password-123";

  await page.goto("/sign-up");
  await page.getByLabel("Username").fill(username);
  await page.getByLabel("Public name (optional)").fill(`Legal ${suffix}`);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Let's go" }).click();
  await expect(page).toHaveURL(/\/home$/);

  await page.goto("/settings");
  await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
  await page.getByRole("link", { name: "Terms of Service" }).click();
  await expectDraftDocument(page, "Terms of Service", "draft-2");
  await page.goBack();
  await expect(page).toHaveURL(/\/settings$/);
  await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
});
