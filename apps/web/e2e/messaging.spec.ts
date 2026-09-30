import { expect, test, type CDPSession, type Page, type TestInfo } from "@playwright/test";

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
  await page.getByLabel("Username").fill(person.username);
  await page.getByLabel("Public name (optional)").fill(person.displayName);
  await page.getByLabel("Email").fill(person.email);
  await page.getByLabel("Password").fill(person.password);
  await page.getByRole("button", { name: "Let's go" }).click();
  await expect(page).toHaveURL(/\/home$/);
}

async function sendWithEnter(page: Page, text: string) {
  const composer = page.getByLabel("Message");
  await composer.fill(text);
  await composer.press("Enter");
}

function messageBubble(page: Page, text: string) {
  return page.locator("article").filter({ has: page.getByText(text, { exact: true }) });
}

async function openRecipientRequest(recipient: Page, sender: Account, firstMessage: string) {
  await recipient.goto(`${origin}/messages`);
  await expect(recipient.getByRole("tab", { name: /Requests/ })).toHaveText(/Requests\s*1/);
  await expect(recipient.getByLabel("1 unread messages")).toBeVisible();
  await recipient.getByRole("tab", { name: /Requests/ }).click();
  await recipient.getByRole("link", { name: new RegExp(sender.displayName) }).click();
  await expect(messageBubble(recipient, firstMessage)).toBeVisible();
}

async function setPageVisibility(session: CDPSession, visibilityState: "hidden" | "visible") {
  // Playwright's generated CDP union does not yet include this Chromium command.
  await (session.send as unknown as (method: string, params: { visibilityState: string }) => Promise<unknown>)("Emulation.setPageVisibilityState", { visibilityState });
}

async function setVisibility(page: Page, visibilityState: "hidden" | "visible") {
  const session = await page.context().newCDPSession(page);
  await setPageVisibility(session, visibilityState);
  await expect.poll(() => page.evaluate(() => document.visibilityState)).toBe(visibilityState);
  return session;
}

test("two people exchange live messages and synchronize unread state", async ({ page, browser }, testInfo) => {
  test.slow();
  const sender = account(testInfo, "sender");
  const recipient = account(testInfo, "recipient");
  const recipientContext = await browser.newContext({ ignoreHTTPSErrors: true });
  const recipientPage = await recipientContext.newPage();
  let visibilitySession: CDPSession | undefined;

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

    // A short message should fit its content instead of spanning the conversation column.
    const bubbleWidths = await firstBubble.evaluate((bubble) => ({ bubble: bubble.getBoundingClientRect().width, parent: bubble.parentElement?.parentElement?.getBoundingClientRect().width ?? 0 }));
    expect(bubbleWidths.bubble).toBeLessThan(bubbleWidths.parent * 0.65);

    await openRecipientRequest(recipientPage, sender, firstMessage);
    await expect(recipientPage.getByLabel("Messages visible")).toBeVisible();
    await recipientPage.getByRole("link", { name: /all messages/ }).click();
    await recipientPage.getByRole("tab", { name: /Requests/ }).click();
    await expect(recipientPage.getByLabel(/unread messages/)).toHaveCount(0, { timeout: 15_000 });
    await expect(recipientPage.getByRole("tab", { name: "Requests" })).toHaveText("Requests");

    // Re-open the now-read request, accept it, and require the sender's current page to update live.
    await recipientPage.getByRole("link", { name: new RegExp(sender.displayName) }).click();
    await recipientPage.getByRole("button", { name: "accept request" }).click();
    await expect(page.getByLabel("Message")).toBeEnabled({ timeout: 15_000 });

    const reply = `live-reply-${sender.username}`;
    const senderURL = page.url();
    await sendWithEnter(recipientPage, reply);
    await expect(messageBubble(page, reply)).toBeVisible({ timeout: 15_000 });
    expect(page.url()).toBe(senderURL);

    await messageBubble(recipientPage, firstMessage).getByLabel("Add reaction").click();
    await recipientPage.getByRole("button", { name: "React Like" }).click();
    await expect(messageBubble(page, firstMessage).getByRole("button", { name: "Like 1" })).toBeVisible({ timeout: 15_000 });

    const multiline = `line one ${sender.username}\nline two`;
    const composer = page.getByLabel("Message");
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
    visibilitySession = await setVisibility(page, "hidden");
    const hiddenMessage = `hidden-${sender.username}`;
    await sendWithEnter(recipientPage, hiddenMessage);
    await expect(messageBubble(page, hiddenMessage)).toBeVisible({ timeout: 15_000 });

    const inboxPage = await page.context().newPage();
    try {
      await inboxPage.goto(`${origin}/messages`);
      await expect(inboxPage.getByLabel("1 unread messages")).toBeVisible({ timeout: 15_000 });

      await setPageVisibility(visibilitySession, "visible");
      await expect.poll(() => page.evaluate(() => document.visibilityState)).toBe("visible");
      await expect(inboxPage.getByLabel(/unread messages/)).toHaveCount(0, { timeout: 15_000 });
    } finally {
      await inboxPage.close();
    }
  } finally {
    await visibilitySession?.detach();
    await recipientContext.close();
  }
});
