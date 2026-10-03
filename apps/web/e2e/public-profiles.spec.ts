import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";

test.setTimeout(60_000);

test("an anonymous visitor can browse a synthetic public profile and safely return from sign-in", async ({ browser, page }, testInfo) => {
  const suffix = `${testInfo.project.name}-${Date.now()}`.replace(/[^a-z0-9]/gi, "").toLowerCase().slice(-18);
  const username = `pub${suffix}`;
  const email = `${username}@example.test`;
  const password = "e2e-password-123";
  const secondUsername = `alt${suffix}`;
  const secondEmail = `${secondUsername}@example.test`;

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

  const secondAccount = await browser.newContext();
  const secondAccountPage = await secondAccount.newPage();
  await secondAccountPage.goto("/sign-up");
  await secondAccountPage.getByLabel("Username").fill(secondUsername);
  await secondAccountPage.getByLabel("Public name (optional)").fill("Alternate E2E");
  await secondAccountPage.getByLabel("Email").fill(secondEmail);
  await secondAccountPage.getByLabel("Password").fill(password);
  await secondAccountPage.getByRole("button", { name: "Let's go" }).click();
  await expect(secondAccountPage).toHaveURL(/\/home$/);
  await secondAccount.close();

  const apiOrigin = process.env.E2E_API_ORIGIN!;
  const postId = await page.evaluate(async (api) => {
    const dayResponse = await fetch(`${api}/api/v1/posting-days/current`, { credentials: "include" });
    if (!dayResponse.ok) throw new Error(`Posting day failed: ${dayResponse.status}`);
    const day = await dayResponse.json() as { localDate: string; prompt: { id: string } };
    const response = await fetch(`${api}/api/v1/posts`, {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json", "idempotency-key": crypto.randomUUID() },
      body: JSON.stringify({ localDate: day.localDate, promptId: day.prompt.id, reflectiveAnswer: "Synthetic released public dayli.", rating: 8, audience: "friends" }),
    });
    if (!response.ok) throw new Error(`Post creation failed: ${response.status} ${await response.text()}`);
    return ((await response.json()) as { id: string }).id;
  }, apiOrigin);
  if (!/^[0-9a-f-]{36}$/.test(postId)) throw new Error("Synthetic post returned an invalid ID");
  const mediaId = `e2e-media-${postId}`;
  const objectKey = `media/e2e/${postId}.png`;
  const imageBytes = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64");
  const objectDirectory = join(process.env.E2E_MEDIA_ROOT!, process.env.E2E_MEDIA_BUCKET!, "media", "e2e");
  mkdirSync(objectDirectory, { recursive: true });
  writeFileSync(join(objectDirectory, `${postId}.png`), imageBytes);
  execFileSync("docker", ["exec", process.env.E2E_POSTGRES_CONTAINER!, "psql", "-U", "postgres", "-d", "dayli_test", "-c", `
    update posts set accepted_at = now() - interval '2 days', released_at = now() - interval '1 day' where id = '${postId}';
    insert into media_reservation (id, owner_id, object_key, content_type, byte_size, status, validated_at, expires_at)
      select '${mediaId}', id, '${objectKey}', 'image/png', ${imageBytes.byteLength}, 'validated', now(), now() + interval '1 day' from "user" where username = '${username}';
    insert into post_media (id, post_id, attachment_order, reservation_id) values ('${mediaId}', '${postId}', 0, '${mediaId}');
  `], { stdio: "pipe" });

  const anonymous = await browser.newContext();
  const visitor = await anonymous.newPage();
  await visitor.goto(`/u/${username}`);
  await expect(visitor.getByRole("heading", { name: "Public E2E" })).toBeVisible();
  await visitor.reload();
  await expect(visitor.getByRole("heading", { name: "Public E2E" })).toBeVisible();
  await visitor.screenshot({ path: testInfo.outputPath("anonymous-public-profile.png"), fullPage: true });
  const publicPost = await visitor.evaluate(async ({ api, id }) => {
    const response = await fetch(`${api}/api/v1/posts/${id}`);
    if (!response.ok) throw new Error(`Anonymous post read failed: ${response.status}`);
    return response.json() as Promise<{ media: Array<{ url: string }> }>;
  }, { api: apiOrigin, id: postId });
  expect(publicPost.media[0]?.url).toBe(`${apiOrigin}/api/v1/posts/${postId}/media/${mediaId}/content`);
  expect(JSON.stringify(publicPost)).not.toContain(objectKey);
  const publicMedia = await visitor.evaluate(async (url) => {
    const response = await fetch(url);
    return { status: response.status, contentType: response.headers.get("content-type"), bytes: [...new Uint8Array(await response.arrayBuffer())] };
  }, publicPost.media[0]!.url);
  expect(publicMedia.status).toBe(200);
  expect(publicMedia.contentType).toBe("image/png");
  expect(publicMedia.bytes).toEqual([...imageBytes]);
  await visitor.goto(`/u/${username}/${postId}`);
  await expect(visitor.getByText("Synthetic released public dayli.")).toBeVisible();
  const renderedImage = visitor.getByRole("img", { name: "Public E2E's photo 1 of 1" });
  await expect(renderedImage).toHaveAttribute("src", publicPost.media[0]!.url);
  await expect(renderedImage).toHaveJSProperty("naturalWidth", 1);
  await expect(visitor.getByRole("link", { name: "like" })).toHaveAttribute("href", /intent%3Dlike/);
  await expect(visitor.getByRole("link", { name: "comment" })).toHaveAttribute("href", /intent%3Dcomment/);
  await visitor.screenshot({ path: testInfo.outputPath("anonymous-public-post.png"), fullPage: true });
  await visitor.getByRole("link", { name: "like" }).click();
  await expect(visitor).toHaveURL(/intent%3Dlike/);
  await visitor.goBack();
  await visitor.getByRole("link", { name: "comment" }).click();
  await expect(visitor).toHaveURL(/intent%3Dcomment/);
  await visitor.goBack();
  await visitor.goBack();

  await visitor.getByRole("link", { name: "message" }).click();
  await expect(visitor).toHaveURL(new RegExp(`/sign-in\\?next=.*message-request`));
  await visitor.goBack();
  await visitor.getByRole("link", { name: "add friend" }).click();
  await expect(visitor).toHaveURL(new RegExp(`/sign-in\\?next=.*${username}`));
  await visitor.goBack();
  await expect(visitor.getByRole("heading", { name: "Public E2E" })).toBeVisible();
  await visitor.goForward();
  const failedContext = await browser.newContext();
  const failedSignIn = await failedContext.newPage();
  await failedSignIn.goto(`/sign-in?next=${encodeURIComponent(`/u/${username}?intent=friend-request`)}`);
  await failedSignIn.getByLabel("Email").fill("missing-account@example.test");
  await failedSignIn.getByLabel("Password").fill("wrong-password");
  await failedSignIn.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(failedSignIn.getByText(/invalid/i)).toBeVisible();
  await expect(failedSignIn).toHaveURL(/\/sign-in\?/);
  await failedContext.close();

  await visitor.getByLabel("Email").fill(email);
  await visitor.getByLabel("Password").fill(password);
  await visitor.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(visitor).toHaveURL(new RegExp(`/u/${username}\\?intent=friend-request$`));
  await expect(visitor.getByText(/Review this profile/)).toBeVisible();

  await visitor.goto("/sign-in?next=https%3A%2F%2Fevil.example%2Fu%2Fsomeone%3Fintent%3Dlike");
  await expect(visitor.getByRole("link", { name: "Sign up" })).toHaveAttribute("href", "/sign-up?next=%2Fhome");

  await visitor.goto("/settings");
  await visitor.getByRole("button", { name: "Sign out" }).click();
  await expect(visitor).not.toHaveURL(/\/settings$/);
  await visitor.goto("/sign-in");
  await visitor.getByLabel("Email").fill(secondEmail);
  await visitor.getByLabel("Password").fill(password);
  await visitor.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(visitor).toHaveURL(/\/home$/);
  await visitor.goto(`/u/${username}?intent=friend-request`);
  await expect(visitor).toHaveURL(new RegExp(`/u/${username}$`));
  await expect(visitor.getByText(/Review this profile/)).toHaveCount(0);

  const messageTarget = `/u/${username}?intent=message-request`;
  const secondActorId = await visitor.evaluate(async (api) => {
    const response = await fetch(`${api}/api/auth/get-session`, { credentials: "include" });
    const session = await response.json() as { user: { id: string } };
    return session.user.id;
  }, apiOrigin);
  await visitor.evaluate(({ target, actorId }) => {
    sessionStorage.setItem(`dayli:public-intent:${target}`, JSON.stringify({ issuedAt: Date.now() - 11 * 60 * 1000, actorId }));
  }, { target: messageTarget, actorId: secondActorId });
  await visitor.goto(messageTarget);
  await expect(visitor).toHaveURL(new RegExp(`/u/${username}$`));
  await expect(visitor.getByText(/Review this profile/)).toHaveCount(0);

  await visitor.evaluate(({ target, actorId }) => {
    sessionStorage.setItem(`dayli:public-intent:${target}`, JSON.stringify({ issuedAt: Date.now(), actorId }));
  }, { target: messageTarget, actorId: secondActorId });
  await visitor.goto(messageTarget);
  await expect(visitor).toHaveURL(new RegExp(`/u/${username}\\?intent=message-request$`));
  await expect(visitor.getByText(/Review this profile/)).toBeVisible();

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
