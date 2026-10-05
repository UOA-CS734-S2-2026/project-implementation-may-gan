import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { signUpWithExplicitConsent } from "./support/legal-consent";

type Account = { username: string; displayName: string; email: string; password: string };

const origin = process.env.E2E_WEB_ORIGIN ?? "https://localhost:3000";

function account(testInfo: TestInfo, role: string): Account {
  const token = `${Date.now().toString(36)}${testInfo.project.name.replace(/[^a-z0-9]/gi, "").slice(0, 4)}${role}`.toLowerCase();
  const username = `e2e${token}`;
  return { username, displayName: `E2E ${role} ${token}`, email: `${username}@example.test`, password: "e2e-password-123" };
}

async function signUp(page: Page, person: Account) {
  await page.goto(origin);
  await page.getByRole("link", { name: /sign up/i }).click();
  await signUpWithExplicitConsent(page, {
    username: person.username,
    publicName: person.displayName,
    email: person.email,
    password: person.password,
  });
}

async function sendWithEnter(page: Page, text: string) {
  const composer = page.getByRole("textbox", { name: "Message" });
  await composer.fill(text);
  await composer.press("Enter");
}

function messageBubble(page: Page, text: string) {
  return page.locator("article").filter({ has: page.getByText(text, { exact: true }) });
}

async function settledMessageContent(page: Page, text: string) {
  const bubble = messageBubble(page, text);
  await expect(bubble).toHaveCount(1);
  await expect(bubble).toHaveAttribute("data-testid", /^message-(?!pending:).+$/);
  const content = bubble.locator("[data-message-content]");
  await expect(content).toBeVisible();
  return content;
}

async function openRecipientRequest(recipient: Page, sender: Account, firstMessage: string) {
  await recipient.goto(`${origin}/messages`);
  await expect(recipient.getByRole("tab", { name: /Requests/ })).toHaveText(/Requests\s*1/);
  await recipient.getByRole("tab", { name: /Requests/ }).click();
  await expect(recipient.getByLabel("1 unread messages")).toBeVisible();
  await recipient.getByRole("link", { name: new RegExp(sender.displayName) }).click();
  await expect(messageBubble(recipient, firstMessage)).toBeVisible();
}

async function setVisibility(page: Page, visibilityState: "hidden" | "visible") {
  await page.evaluate((state) => {
    Object.defineProperty(document, "visibilityState", { configurable: true, value: state });
    document.dispatchEvent(new Event("visibilitychange"));
  }, visibilityState);
  await expect.poll(() => page.evaluate(() => document.visibilityState)).toBe(visibilityState);
}

test("two people exchange live messages and synchronize unread state", async ({ page, browser }, testInfo) => {
  test.slow();
  const sender = account(testInfo, "sender");
  const recipient = account(testInfo, "recipient");
  const recipientContext = await browser.newContext({ ignoreHTTPSErrors: true });
  const recipientPage = await recipientContext.newPage();

  try {
    await signUp(page, sender);
    await signUp(recipientPage, recipient);

    // The draft route creates no empty conversation: this first Enter creates a normal request thread.
    const firstMessage = `first-${sender.username}`;
    await page.goto(`${origin}/messages/new/${recipient.username}`);
    await sendWithEnter(page, firstMessage);
    await expect(page).toHaveURL(/\/messages\/[^/]+$/);
    await expect(page.getByRole("heading", { name: recipient.displayName })).toBeVisible();
    const firstBubble = messageBubble(page, firstMessage);
    await expect(firstBubble).toBeVisible();

    await openRecipientRequest(recipientPage, sender, firstMessage);
    await expect(recipientPage.getByLabel("Messages visible")).toBeVisible();
    await recipientPage.getByRole("link", { name: /all messages/ }).click();
    await recipientPage.getByRole("tab", { name: /Requests/ }).click();
    await expect(recipientPage.getByLabel(/unread messages/)).toHaveCount(0, { timeout: 15_000 });
    await expect(recipientPage.getByRole("tab", { name: "Requests" })).toHaveText("Requests");

    // Re-open the now-read request, accept it, and require the sender's current page to update live.
    await recipientPage.getByRole("link", { name: new RegExp(sender.displayName) }).click();
    await recipientPage.getByRole("button", { name: "accept request" }).click();
    await expect(recipientPage.getByRole("textbox", { name: "Message" })).toBeEnabled({ timeout: 15_000 });
    await expect(page.getByRole("textbox", { name: "Message" })).toBeEnabled({ timeout: 15_000 });

    // A short bubble must fit its content, while a long one is capped at 84% of
    // the message column. Together these fail if bubbles return to full width.
    const longMessage = `A deliberately long message ${sender.username} `.repeat(12);
    await sendWithEnter(page, longMessage);
    const [shortBubble, longBubble] = await Promise.all([
      settledMessageContent(page, firstMessage),
      settledMessageContent(page, longMessage),
    ]);
    const measure = (element: HTMLElement) => ({
      bubble: element.getBoundingClientRect().width,
      messageColumn: element.closest("article")?.parentElement?.parentElement?.getBoundingClientRect().width ?? 0,
    });
    const shortBubbleWidth = await shortBubble.evaluate(measure);
    const longBubbleWidth = await longBubble.evaluate(measure);
    expect(shortBubbleWidth.bubble).toBeLessThan(longBubbleWidth.bubble);
    expect(longBubbleWidth.bubble).toBeLessThanOrEqual(longBubbleWidth.messageColumn * 0.84 + 1);

    const reply = `live-reply-${sender.username}`;
    const senderURL = page.url();
    await sendWithEnter(recipientPage, reply);
    await expect(messageBubble(page, reply)).toBeVisible({ timeout: 15_000 });
    expect(page.url()).toBe(senderURL);

    const recipientFirstBubble = messageBubble(recipientPage, firstMessage);
    if (testInfo.project.name === "mobile-chromium") {
      await recipientFirstBubble.dispatchEvent("pointerdown", { pointerType: "touch" });
      await expect(recipientPage.getByRole("dialog", { name: "Message actions" })).toBeVisible();
    } else {
      await recipientFirstBubble.hover();
      await recipientFirstBubble.getByLabel("Add reaction").click();
    }
    await recipientPage.getByRole("button", { name: "React Like" }).click();
    await expect(messageBubble(page, firstMessage).getByLabel("View reactions")).toHaveText("👍", { timeout: 15_000 });

    const multiline = `line one ${sender.username}\nline two`;
    const composer = page.getByRole("textbox", { name: "Message" });
    await composer.fill(`line one ${sender.username}`);
    await composer.press("Shift+Enter");
    await composer.type("line two");
    await expect(composer).toHaveValue(multiline);
    await composer.press("Enter");
    await expect(messageBubble(recipientPage, multiline)).toBeVisible({ timeout: 15_000 });

    // A message delivered while this conversation is actually visible is read without an inbox badge.
    const visibleMessage = `visible-${sender.username}`;
    await sendWithEnter(recipientPage, visibleMessage);
    await expect(messageBubble(page, visibleMessage)).toBeVisible({ timeout: 15_000 });
    await page.getByRole("link", { name: /all messages/ }).click();
    await expect(page.getByLabel(/unread messages/)).toHaveCount(0, { timeout: 15_000 });
    await page.getByRole("link", { name: new RegExp(recipient.displayName) }).click();
    await expect(messageBubble(page, visibleMessage)).toBeVisible();

    // A hidden conversation retains the unread message until its visible message target returns to the foreground.
    await setVisibility(page, "hidden");
    const hiddenMessage = `hidden-${sender.username}`;
    await sendWithEnter(recipientPage, hiddenMessage);
    await expect(messageBubble(page, hiddenMessage)).toBeVisible({ timeout: 15_000 });
    // Let the rerendered trailing-message observer establish its hidden target.
    await page.waitForTimeout(100);

    await setVisibility(page, "visible");
    await page.waitForTimeout(250);
    await page.getByRole("link", { name: /all messages/ }).click();
    await expect(page.getByLabel(/unread messages/)).toHaveCount(0, { timeout: 15_000 });
  } finally {
    await recipientContext.close();
  }
});
