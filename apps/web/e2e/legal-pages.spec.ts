import { expect, test } from "@playwright/test";

async function expectDraftDocument(
  page: import("@playwright/test").Page,
  title: string,
  path: string,
) {
  await expect(page).toHaveURL(new RegExp(`${path}$`));
  await expect(page.getByRole("heading", { name: title })).toBeVisible();
  await expect(page.getByRole("status")).toContainText("Draft, not approved");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "default");
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
    .toBe(true);
}

test("public draft legal readers work from direct URLs and the landing page", async ({ page }) => {
  await page.goto("/privacy");
  await expectDraftDocument(page, "Privacy Policy", "/privacy");
  await expect(page.getByText(/agroupforcoders@gmail\.com/i).first()).toBeVisible();

  await page.getByRole("link", { name: "Read the draft Terms of Service" }).click();
  await expectDraftDocument(page, "Terms of Service", "/terms");

  await page.goto("/");
  await page.getByRole("link", { name: "Privacy Policy" }).click();
  await expectDraftDocument(page, "Privacy Policy", "/privacy");
});
