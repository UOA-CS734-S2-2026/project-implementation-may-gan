import { expect, test } from "@playwright/test";

test("public auth entries use compact approved legal links", async ({ page }) => {
  for (const path of ["/sign-up", "/sign-in"]) {
    await page.goto(path);

    const legalLinks = page.getByRole("navigation", { name: "Legal documents" });
    await expect(legalLinks.getByRole("link", { name: "Privacy Policy" })).toHaveAttribute("href", "/privacy");
    await expect(legalLinks.getByRole("link", { name: "Terms of Service" })).toHaveAttribute("href", "/terms");
    await expect(page.getByText("(draft)", { exact: true })).toHaveCount(0);
    await expect(page.getByText(/Review Dayli's draft legal documents/i)).toHaveCount(0);
    await expect(page.getByText(/not approved terms or privacy notices/i)).toHaveCount(0);
  }

  await page.goto("/sign-up");
  await page.getByRole("link", { name: "Privacy Policy" }).click();
  await expect(page).toHaveURL(/\/privacy$/);
  await expect(page.getByRole("heading", { name: "Privacy Policy" })).toBeVisible();
});
