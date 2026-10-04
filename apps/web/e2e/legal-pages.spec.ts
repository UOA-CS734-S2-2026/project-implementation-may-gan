import { expect, test } from "@playwright/test";

async function expectApprovedDocument(
  page: import("@playwright/test").Page,
  title: string,
  path: string,
) {
  await expect(page).toHaveURL(new RegExp(`${path}$`));
  await expect(page.getByRole("heading", { name: title })).toBeVisible();
  await expect(page.getByText("Effective 2026-10-04")).toBeVisible();
  await expect(page.getByText(/Draft, not approved for publication/i)).toHaveCount(0);
  await expect(page.locator("html")).toHaveAttribute("data-theme", "default");
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
    .toBe(true);
}

test("public approved legal readers work from direct URLs and the landing page", async ({ page }) => {
  await page.goto("/privacy");
  await expectApprovedDocument(page, "Privacy Policy", "/privacy");
  await expect(page.getByText(/agroupforcoders@gmail\.com/i).first()).toBeVisible();

  await page.getByRole("link", { name: "Read the Terms of Service" }).click();
  await expectApprovedDocument(page, "Terms of Service", "/terms");

  await page.goto("/");
  await page.getByRole("link", { name: "Privacy Policy" }).click();
  await expectApprovedDocument(page, "Privacy Policy", "/privacy");
});
