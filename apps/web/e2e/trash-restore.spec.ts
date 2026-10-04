import { expect, test } from "@playwright/test";

test.setTimeout(60_000);

test("an owner moves a post to Trash, sees concealment, and restores it", async ({ browser, page }, testInfo) => {
  const suffix = `${testInfo.project.name}-${Date.now()}`.replace(/[^a-z0-9]/gi, "").toLowerCase().slice(-18);
  const username = `trash${suffix}`;
  const email = `${username}@example.test`;
  const password = "e2e-password-123";
  const apiOrigin = process.env.E2E_API_ORIGIN!;

  await page.goto("/sign-up");
  await page.getByLabel("Username").fill(username);
  await page.getByLabel("Public name (optional)").fill("Trash E2E");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Let's go" }).click();
  await expect(page).toHaveURL(/\/home$/);

  const postId = await page.evaluate(async (api) => {
    const dayResponse = await fetch(`${api}/api/v1/posting-days/current`, { credentials: "include" });
    if (!dayResponse.ok) throw new Error(`Posting day failed: ${dayResponse.status}`);
    const day = await dayResponse.json() as { localDate: string; prompt: { id: string } };
    const response = await fetch(`${api}/api/v1/posts`, {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json", "idempotency-key": crypto.randomUUID() },
      body: JSON.stringify({ localDate: day.localDate, promptId: day.prompt.id, reflectiveAnswer: "Synthetic Trash journey.", rating: 7, audience: "friends" }),
    });
    if (!response.ok) throw new Error(`Post creation failed: ${response.status}`);
    return ((await response.json()) as { id: string }).id;
  }, apiOrigin);

  const trashStatus = await page.evaluate(async ({ api, id }) => {
    const response = await fetch(`${api}/api/v1/posts/${id}/trash`, { method: "POST", credentials: "include" });
    return { status: response.status, body: await response.json() as { restoreUntil?: string; purgeDueAt?: string } };
  }, { api: apiOrigin, id: postId });
  expect(trashStatus.status).toBe(200);
  expect(Date.parse(trashStatus.body.restoreUntil!)).toBeLessThan(Date.parse(trashStatus.body.purgeDueAt!));

  const anonymous = await browser.newContext();
  const visitor = await anonymous.newPage();
  const concealed = await visitor.request.get(`${apiOrigin}/api/v1/posts/${postId}`);
  expect(concealed.status()).toBe(404);
  await anonymous.close();

  await page.goto("/settings");
  await expect(page.getByRole("heading", { name: "Trash" })).toBeVisible();
  await expect(page.getByText(new RegExp(`Dayli from`))).toBeVisible();
  await expect(page.getByText(/Permanent cleanup is due/)).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("owner-trash.png"), fullPage: true });
  const restoreResponse = page.waitForResponse((response) => response.url().endsWith(`/api/v1/posts/${postId}/restore`) && response.request().method() === "POST");
  await page.getByRole("button", { name: "Restore" }).click();
  expect((await restoreResponse).status()).toBe(200);
  await expect(page.getByText("Trash is empty.")).toBeVisible();

  const restored = await page.evaluate(async ({ api, id }) => {
    const response = await fetch(`${api}/api/v1/posts/${id}`, { credentials: "include" });
    return { status: response.status, text: await response.text() };
  }, { api: apiOrigin, id: postId });
  expect(restored.status).toBe(200);
  expect(restored.text).toContain("Synthetic Trash journey.");
});
