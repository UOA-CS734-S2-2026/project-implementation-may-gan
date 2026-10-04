import { expect, test } from "@playwright/test";

test.describe("desktop messaging polish", { tag: "@desktop" }, () => {
  test.beforeEach(async ({ page }) => {
    test.skip(process.env.E2E_MESSAGING !== "1", "mock messaging harness only");
    await page.addInitScript(() => {
      Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async (value: string) => { (window as Window & { copiedText?: string }).copiedText = value; } } });
    });
    await page.goto("/e2e/messaging");
  });

  test("keeps the hover toolbar out of layout and exposes quick and full reactions", async ({ page }) => {
    await page.clock.install();
    await page.getByRole("button", { name: "Simulate slow fetch" }).click();
    await expect(page.getByLabel("Loading conversations")).toBeVisible();
    await expect(page.getByLabel("Loading messages")).toBeVisible();
    await page.clock.runFor(650);
    await expect(page.getByText("Conversation with Ada, A real message")).toBeVisible();
    const received = page.getByTestId("message-received");
    const before = await received.boundingBox();
    await received.hover();
    await expect(received.getByLabel("Add reaction")).toBeVisible();
    await expect(received.getByLabel("Reply")).toBeVisible();
    await expect(received.getByLabel("Message actions")).toBeVisible();
    expect(await received.boundingBox()).toEqual(before);

    await received.getByLabel("Add reaction").click();
    await expect(page.getByRole("group", { name: "Quick reactions" })).toBeVisible();
    await page.getByLabel("More reactions").click();
    await page.getByRole("button", { name: "React Angry" }).click();
    await expect(received.getByLabel("View reactions")).toContainText("😡");

    await received.getByLabel("View reactions").click();
    await expect(page.getByRole("dialog", { name: "Reaction details" })).toContainText("Ada");
    await page.getByRole("button", { name: "Remove your reaction" }).click();
    await page.getByRole("button", { name: "Refresh" }).click();
    await expect(received.getByLabel("View reactions")).toContainText("❤️");
  });

  test("opens the timestamp menu, copies, replies, supports keyboard, and reduces motion", async ({ page }) => {
    await expect(page.getByText("Conversation with Ada, A real message")).toBeVisible();
    const received = page.getByTestId("message-received");
    await received.hover();
    await received.getByLabel("Message actions").click();
    await expect(page.getByRole("menu", { name: "Message actions" })).toContainText(/\d/);
    await page.getByRole("button", { name: "Copy" }).click();
    await expect.poll(() => page.evaluate(() => (window as Window & { copiedText?: string }).copiedText)).toBe("A real message");
    await received.hover();
    await received.getByLabel("Reply").click();
    await expect(page.getByRole("status")).toContainText("Replying to: A real message");
    await received.getByLabel("Add reaction").focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("group", { name: "Quick reactions" })).toBeVisible();

    await page.emulateMedia({ reducedMotion: "reduce" });
    expect(await received.getByLabel("View reactions").evaluate((element) => getComputedStyle(element.parentElement!).animationName)).toBe("none");
  });
});

test.describe("mobile messaging polish", { tag: "@mobile" }, () => {
  test.beforeEach(async ({ page }) => {
    test.skip(process.env.E2E_MESSAGING !== "1", "mock messaging harness only");
    await page.goto("/e2e/messaging");
    await expect(page.getByText("Conversation with Ada, A real message")).toBeVisible();
  });

  test("uses a long press for reactions and actions, while scrolling cancels it", async ({ page }) => {
    const received = page.getByTestId("message-received");
    await expect(received.getByLabel("Add reaction")).toBeHidden();
    await page.clock.install();
    await received.dispatchEvent("pointerdown", { pointerType: "touch" });
    await page.clock.runFor(500);
    await expect(page.getByRole("dialog", { name: "Message actions" })).toBeVisible();
    await page.getByRole("button", { name: "Cancel" }).click();

    await received.dispatchEvent("pointerdown", { pointerType: "touch" });
    await page.evaluate(() => window.dispatchEvent(new Event("scroll")));
    await page.clock.runFor(500);
    await expect(page.getByRole("dialog", { name: "Message actions" })).toBeHidden();
  });

  test("double tapping preserves an existing heart", async ({ page }) => {
    const received = page.getByTestId("message-received");
    await received.dblclick();
    await expect(received.getByLabel("View reactions")).toContainText("❤️ 2");
  });
});
