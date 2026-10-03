import { expect, test } from "@playwright/test";

test("an anonymous visitor can browse a synthetic public profile and safely return from sign-in", async ({ browser, page }, testInfo) => {
  const suffix = `${testInfo.project.name}-${Date.now()}`.replace(/[^a-z0-9]/gi, "").toLowerCase().slice(-18);
  const username = `pub${suffix}`;
  const email = `${username}@example.test`;
  const password = "e2e-password-123";

  await page.goto("/sign-up");
  await page.getByLabel("Username").fill(username);
  await page.getByLabel("Public name (optional)").fill("Public E2E");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Let's go" }).click();
  await expect(page).toHaveURL(/\/home$/);

  await page.goto("/settings");
  const visibility = page.getByRole("switch", { name: "Private profile" });
  if (await visibility.getAttribute("aria-checked") === "true") await visibility.click();
  await expect(visibility).toHaveAttribute("aria-checked", "false");

  const anonymous = await browser.newContext();
  const visitor = await anonymous.newPage();
  await visitor.goto(`/u/${username}`);
  await expect(visitor.getByRole("heading", { name: "Public E2E" })).toBeVisible();
  await visitor.reload();
  await expect(visitor.getByRole("heading", { name: "Public E2E" })).toBeVisible();
  await visitor.screenshot({ path: testInfo.outputPath("anonymous-public-profile.png"), fullPage: true });

  await visitor.getByRole("link", { name: "add friend" }).click();
  await expect(visitor).toHaveURL(new RegExp(`/sign-in\\?next=.*${username}`));
  await visitor.goBack();
  await expect(visitor.getByRole("heading", { name: "Public E2E" })).toBeVisible();
  await visitor.goForward();
  await visitor.getByLabel("Email").fill(email);
  await visitor.getByLabel("Password").fill(password);
  await visitor.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(visitor).toHaveURL(new RegExp(`/u/${username}\\?intent=friend-request$`));
  await expect(visitor.getByText(/Review this profile/)).toBeVisible();

  await visitor.goto("/sign-in?next=https%3A%2F%2Fevil.example%2Fu%2Fsomeone%3Fintent%3Dlike");
  await expect(visitor.getByRole("link", { name: "Sign up" })).toHaveAttribute("href", "/sign-up?next=%2Fhome");

  if (await visibility.getAttribute("aria-checked") === "false") await visibility.click();
  await expect(visibility).toHaveAttribute("aria-checked", "true");
  await anonymous.close();

  const restrictedContext = await browser.newContext();
  const restrictedVisitor = await restrictedContext.newPage();
  await restrictedVisitor.goto(`/u/${username}`);
  await expect(restrictedVisitor.getByText("This profile is private.")).toBeVisible();
  await expect(restrictedVisitor.getByRole("heading", { name: "Public E2E" })).toHaveCount(0);
  await restrictedVisitor.screenshot({ path: testInfo.outputPath("anonymous-private-profile.png"), fullPage: true });
  await restrictedContext.close();
});
