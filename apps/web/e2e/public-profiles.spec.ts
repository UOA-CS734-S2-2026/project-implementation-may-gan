import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Browser, type Page, type TestInfo } from "@playwright/test";
import { signUpAcceptedApiFixture, signUpWithExplicitConsent } from "./support/legal-consent";

// Creating two accounts and loading multiple contexts can cold-start slowly on hosted runners.
test.setTimeout(120_000);

function database(query: string): string {
  return execFileSync("docker", ["exec", process.env.E2E_POSTGRES_CONTAINER!, "psql", "-At", "-U", "postgres", "-d", "dayli_test", "-c", query], { encoding: "utf8" }).trim();
}

async function signUp(page: Page, username: string, email: string, password: string, publicName: string) {
  await signUpAcceptedApiFixture(page, { username, email, password, publicName });
}

async function setupIntentFixture(browser: Browser, authorPage: Page, testInfo: TestInfo, activeFriends: boolean) {
  database('delete from "rateLimit"');
  const suffix = `${testInfo.project.name}-${testInfo.title}-${Date.now()}`.replace(/[^a-z0-9]/gi, "").toLowerCase().slice(-16);
  const author = `ia${suffix}`;
  const viewer = `iv${suffix}`;
  const password = "e2e-password-123";
  const authorEmail = `${author}@example.test`;
  const viewerEmail = `${viewer}@example.test`;
  await signUp(authorPage, author, authorEmail, password, "Intent Author");
  await authorPage.goto("/settings");
  const visibility = authorPage.getByRole("switch", { name: "Private profile" });
  if (await visibility.getAttribute("aria-checked") === "true") await visibility.click();
  await expect(visibility).toHaveAttribute("aria-checked", "false");
  const postId = await authorPage.evaluate(async (api) => {
    const dayResponse = await fetch(`${api}/api/v1/posting-days/current`, { credentials: "include" });
    const day = await dayResponse.json() as { localDate: string; prompt: { id: string } };
    const response = await fetch(`${api}/api/v1/posts`, {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json", "idempotency-key": crypto.randomUUID() },
      body: JSON.stringify({ localDate: day.localDate, promptId: day.prompt.id, reflectiveAnswer: "Intent target dayli.", rating: 8, audience: "friends" }),
    });
    return ((await response.json()) as { id: string }).id;
  }, process.env.E2E_API_ORIGIN!);
  database(`update posts set accepted_at = now() - interval '2 days', released_at = now() - interval '1 day' where id = '${postId}'`);

  const setup = await browser.newContext();
  const setupPage = await setup.newPage();
  await signUp(setupPage, viewer, viewerEmail, password, "Intent Viewer");
  await setup.close();
  const authorId = database(`select id from \"user\" where username = '${author}'`);
  database(`update \"user\" set profile_visibility = 'public' where id = '${authorId}'`);
  const viewerId = database(`select id from \"user\" where username = '${viewer}'`);
  if (activeFriends) database(`insert into friendships (user_id, friend_id, state, state_changed_at) values ('${authorId}', '${viewerId}', 'active', now()), ('${viewerId}', '${authorId}', 'active', now())`);
  await authorPage.request.post(`${process.env.E2E_API_ORIGIN}/api/auth/sign-out`);
  const visitorContext = authorPage.context();
  await visitorContext.clearCookies();
  await authorPage.close();
  const visitorPage = await visitorContext.newPage();
  return {
    author, viewer, viewerEmail, password, postId, authorId, viewerId,
    anonymous: { close: async () => { await visitorPage.close(); } },
    page: visitorPage,
  };
}

async function signInFromIntent(page: Page, email: string, password: string, cleanPath: RegExp) {
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(cleanPath);
}

async function proveConsumed(page: Page, rawTarget: string, notice: RegExp, count: () => number) {
  const before = count();
  await page.reload();
  await page.goBack();
  await page.goForward();
  await page.goto(rawTarget);
  await expect(page.getByText(notice)).toHaveCount(0);
  expect(count()).toBe(before);
}

test("an anonymous visitor can browse a synthetic public profile and safely return from sign-in", async ({ browser, page }, testInfo) => {
  const suffix = `${testInfo.project.name}-${Date.now()}`.replace(/[^a-z0-9]/gi, "").toLowerCase().slice(-18);
  const username = `pub${suffix}`;
  const email = `${username}@example.test`;
  const password = "e2e-password-123";
  const secondUsername = `alt${suffix}`;
  const secondEmail = `${secondUsername}@example.test`;

  await page.goto("/sign-up");
  await signUpWithExplicitConsent(page, {
    username, publicName: "Public E2E", email, password,
  });

  await page.goto("/settings");
  const visibility = page.getByRole("switch", { name: "Private profile" });
  if (await visibility.getAttribute("aria-checked") === "true") await visibility.click();
  await expect(visibility).toHaveAttribute("aria-checked", "false");

  const secondAccount = await browser.newContext();
  const secondAccountPage = await secondAccount.newPage();
  await secondAccountPage.goto("/sign-up");
  await signUpWithExplicitConsent(secondAccountPage, {
    username: secondUsername, publicName: "Alternate E2E", email: secondEmail, password,
  });
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
  const soloPostId = `solo-${postId}`;
  const unreleasedPostId = `unreleased-${postId}`;
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
    insert into posts (id, author_id, local_date, prompt_id, reflective_answer, rating, audience, accepted_at, released_at)
      select '${soloPostId}', author_id, local_date - 1, prompt_id, 'Never public solo body.', 5, 'solo', accepted_at - interval '1 day', released_at - interval '1 day'
      from posts where id = '${postId}';
    insert into posts (id, author_id, local_date, prompt_id, reflective_answer, rating, audience, accepted_at, released_at)
      select '${unreleasedPostId}', author_id, local_date + 1, prompt_id, 'Never public unreleased body.', 6, 'friends', now(), now() + interval '1 day'
      from posts where id = '${postId}';
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
  for (const concealedId of [soloPostId, unreleasedPostId]) {
    const response = await visitor.request.get(`${apiOrigin}/api/v1/posts/${concealedId}`);
    expect(response.status()).toBe(404);
  }
  const archive = await visitor.request.get(`${apiOrigin}/api/v1/profiles/${username}/posts`);
  expect(archive.status()).toBe(200);
  const archiveText = await archive.text();
  expect(archiveText).toContain(postId);
  expect(archiveText).not.toContain(soloPostId);
  expect(archiveText).not.toContain(unreleasedPostId);
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
  await expect(visitor).toHaveURL(new RegExp(`/u/${username}/${postId}$`));
  await expect(visitor.getByText("Synthetic released public dayli.")).toBeVisible();
  await visitor.getByRole("link", { name: "comment" }).click();
  await expect(visitor).toHaveURL(/intent%3Dcomment/);
  await visitor.goBack();
  await expect(visitor).toHaveURL(new RegExp(`/u/${username}/${postId}$`));
  await expect(visitor.getByText("Synthetic released public dayli.")).toBeVisible();
  await visitor.goBack();
  await expect(visitor).toHaveURL(new RegExp(`/u/${username}$`));
  await expect(visitor.getByRole("heading", { name: "Public E2E" })).toBeVisible();

  await visitor.getByRole("link", { name: "message" }).click();
  await expect(visitor).toHaveURL(new RegExp(`/sign-in\\?next=.*message-request`));
  await visitor.goBack();
  await visitor.getByRole("link", { name: "add friend" }).click();
  await expect(visitor).toHaveURL(new RegExp(`/sign-in\\?next=.*${username}`));
  await visitor.goBack();
  await expect(visitor).toHaveURL(new RegExp(`/u/${username}$`));
  await expect(visitor.getByRole("heading", { name: "Public E2E" })).toBeVisible();
  await visitor.goForward();
  await expect(visitor).toHaveURL(new RegExp(`/sign-in\\?next=.*${username}`));
  await expect(visitor.getByLabel("Email")).toBeVisible();
  const failedContext = await browser.newContext();
  const failedSignIn = await failedContext.newPage();
  await failedSignIn.goto(`/sign-in?next=${encodeURIComponent(`/u/${username}?intent=friend-request`)}`);
  await failedSignIn.getByLabel("Email").fill("missing-account@example.test");
  await failedSignIn.getByLabel("Password").fill("wrong-password");
  await failedSignIn.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(failedSignIn.getByText(/invalid/i)).toBeVisible();
  await expect(failedSignIn).toHaveURL(/\/sign-in\?/);
  await failedContext.close();

  await visitor.getByLabel("Email").fill(secondEmail);
  await visitor.getByLabel("Password").fill(password);
  await visitor.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(visitor).toHaveURL(new RegExp(`/u/${username}$`));
  await expect(visitor.getByText(/Review this profile/)).toBeVisible();
  const authorId = await page.evaluate(async (api) => {
    const response = await fetch(`${api}/api/auth/get-session`, { credentials: "include" });
    return ((await response.json()) as { user: { id: string } }).user.id;
  }, apiOrigin);
  const viewerId = await visitor.evaluate(async (api) => {
    const response = await fetch(`${api}/api/auth/get-session`, { credentials: "include" });
    return ((await response.json()) as { user: { id: string } }).user.id;
  }, apiOrigin);
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(authorId) || !/^[A-Za-z0-9_-]{20,64}$/.test(viewerId)) throw new Error("Synthetic actor ID was invalid");
  execFileSync("docker", ["exec", process.env.E2E_POSTGRES_CONTAINER!, "psql", "-U", "postgres", "-d", "dayli_test", "-c", `insert into friendships (user_id, friend_id, state, state_changed_at) values ('${authorId}', '${viewerId}', 'active', now()), ('${viewerId}', '${authorId}', 'active', now())`], { stdio: "pipe" });

  await visitor.goto(`/u/${username}/${postId}`);
  await expect(visitor.getByText("Synthetic released public dayli.")).toBeVisible();
  await expect(visitor.getByRole("button", { name: "Like" })).toHaveAttribute("aria-pressed", "false");
  await visitor.getByRole("button", { name: "Like" }).click();
  await expect(visitor.getByRole("button", { name: "Unlike" })).toHaveAttribute("aria-pressed", "true");
  const commentText = `Explicit comment ${suffix}`;
  await visitor.getByRole("textbox", { name: "Add a comment" }).fill(commentText);
  await visitor.getByRole("button", { name: "Post", exact: true }).click();
  await expect(visitor.getByText(commentText)).toBeVisible();
  const exactCounts = async () => {
    const [detailResponse, likesResponse, commentsResponse] = await Promise.all([
      visitor.request.get(`${apiOrigin}/api/v1/posts/${postId}`),
      visitor.request.get(`${apiOrigin}/api/v1/posts/${postId}/likes`),
      visitor.request.get(`${apiOrigin}/api/v1/posts/${postId}/comments`),
    ]);
    if (!detailResponse.ok() || !likesResponse.ok() || !commentsResponse.ok()) {
      throw new Error(`Count read failed: ${detailResponse.status()}/${likesResponse.status()}/${commentsResponse.status()}`);
    }
    return {
      detail: await detailResponse.json() as { likeCount: number; commentCount: number },
      likes: await likesResponse.json() as { items: unknown[] },
      comments: await commentsResponse.json() as { items: Array<{ text: string }> },
    };
  };
  await expect.poll(async () => {
    const current = await exactCounts();
    return {
      detail: current.detail,
      likes: current.likes.items.length,
      comments: current.comments.items.filter((item) => item.text === commentText).length,
    };
  }).toEqual({ detail: expect.objectContaining({ likeCount: 1, commentCount: 1 }), likes: 1, comments: 1 });
  let counts = await exactCounts();
  await visitor.reload();
  await expect(visitor).toHaveURL(new RegExp(`/u/${username}/${postId}$`));
  await expect(visitor.getByText("Synthetic released public dayli.")).toBeVisible();
  await visitor.goBack();
  await expect(visitor).toHaveURL(new RegExp(`/u/${username}$`));
  await expect(visitor.getByRole("heading", { name: "Public E2E" })).toBeVisible();
  await visitor.goForward();
  await expect(visitor).toHaveURL(new RegExp(`/u/${username}/${postId}$`));
  await expect(visitor.getByText("Synthetic released public dayli.")).toBeVisible();
  counts = await exactCounts();
  expect(counts.detail).toMatchObject({ likeCount: 1, commentCount: 1 });
  expect(counts.likes.items).toHaveLength(1);
  expect(counts.comments.items.filter((item) => item.text === commentText)).toHaveLength(1);

  await visitor.goto("/sign-in?next=https%3A%2F%2Fevil.example%2Fu%2Fsomeone%3Fintent%3Dlike");
  await expect(visitor.getByRole("link", { name: "Sign up" })).toHaveAttribute("href", "/sign-up?next=%2Fhome");

  const messageTarget = `/u/${username}?intent=message-request`;
  await visitor.evaluate(({ target, actorId }) => {
    sessionStorage.setItem(`dayli:public-intent:${target}`, JSON.stringify({ issuedAt: Date.now(), actorId }));
  }, { target: messageTarget, actorId: authorId });
  await visitor.goto(messageTarget);
  await expect(visitor).toHaveURL(new RegExp(`/u/${username}$`));
  await expect(visitor.getByText(/Review this profile/)).toHaveCount(0);

  const secondActorId = viewerId;
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
  await expect(visitor).toHaveURL(new RegExp(`/u/${username}$`));
  await expect(visitor.getByText(/Review this profile/)).toBeVisible();

  const restrictedContext = await browser.newContext();
  const restrictedVisitor = await restrictedContext.newPage();
  await restrictedVisitor.goto(`/u/${username}/${postId}`);
  await expect(restrictedVisitor.getByText("Synthetic released public dayli.")).toBeVisible();
  expect((await restrictedVisitor.request.get(publicPost.media[0]!.url)).status()).toBe(200);

  if (await visibility.getAttribute("aria-checked") === "false") await visibility.click();
  await expect(visibility).toHaveAttribute("aria-checked", "true");

  await restrictedVisitor.reload();
  await expect(restrictedVisitor.getByText("Synthetic released public dayli.")).toHaveCount(0);
  await restrictedVisitor.goto(`/u/${username}`);
  await expect(restrictedVisitor.getByText("This profile is private.")).toBeVisible();
  await expect(restrictedVisitor.getByRole("heading", { name: "Public E2E" })).toHaveCount(0);
  expect(await restrictedVisitor.locator("body").innerText()).not.toContain("Synthetic released public dayli.");
  const privateDirect = await restrictedVisitor.request.get(`${apiOrigin}/api/v1/posts/${postId}`);
  const privateMedia = await restrictedVisitor.request.get(publicPost.media[0]!.url);
  expect([privateDirect.status(), privateMedia.status()]).toEqual([404, 404]);
  await restrictedVisitor.screenshot({ path: testInfo.outputPath("anonymous-private-profile.png"), fullPage: true });

  const friend = visitor;
  await friend.goto(`/u/${username}/${postId}`);
  await expect(friend.getByText("Synthetic released public dayli.")).toBeVisible();
  for (const route of [
    `/api/v1/profiles/${username}/posts`,
    `/api/v1/profiles/${username}/mood`,
    `/api/v1/posts/${postId}/revisions`,
    `/api/v1/posts/${postId}/likes`,
    `/api/v1/posts/${postId}/comments`,
  ]) expect((await friend.request.get(`${apiOrigin}${route}`)).status()).toBe(200);

  const blocked = await page.evaluate(async ({ api, id }) => fetch(`${api}/api/v1/relationships/${id}/block`, { method: "POST", credentials: "include" }).then((response) => response.status), { api: apiOrigin, id: viewerId });
  expect(blocked).toBe(200);
  await friend.reload();
  await expect(friend.getByText("Synthetic released public dayli.")).toHaveCount(0);
  await expect(friend.getByText(/isn't available|not found/i)).toBeVisible();
  expect(await friend.locator("body").innerText()).not.toContain("Synthetic released public dayli.");
  for (const route of [
    `/api/v1/profiles/${username}`,
    `/api/v1/profiles/${username}/posts`,
    `/api/v1/profiles/${username}/mood`,
    `/api/v1/posts/${postId}`,
    `/api/v1/posts/${postId}/media/${mediaId}`,
    `/api/v1/posts/${postId}/media/${mediaId}/content`,
    `/api/v1/posts/${postId}/revisions`,
    `/api/v1/posts/${postId}/likes`,
    `/api/v1/posts/${postId}/comments`,
  ]) expect((await friend.request.get(`${apiOrigin}${route}`)).status()).toBe(404);
  await friend.goBack();
  await expect(friend).toHaveURL(new RegExp(`/u/${username}$`));
  await expect(friend.getByRole("heading", { name: "This profile is unavailable" })).toBeVisible();
  await friend.goForward();
  await expect(friend).toHaveURL(new RegExp(`/u/${username}/${postId}$`));
  await expect(friend.getByText(/isn't available|not found/i)).toBeVisible();
  expect(await friend.locator("body").innerText()).not.toContain("Synthetic released public dayli.");

  const unblocked = await page.evaluate(async ({ api, id }) => fetch(`${api}/api/v1/relationships/${id}/block`, { method: "DELETE", credentials: "include" }).then((response) => response.status), { api: apiOrigin, id: viewerId });
  expect(unblocked).toBe(200);
  if (await visibility.getAttribute("aria-checked") === "true") await visibility.click();
  await expect(visibility).toHaveAttribute("aria-checked", "false");
  await restrictedVisitor.goto(`/u/${username}/${postId}`);
  await expect(restrictedVisitor.getByText("Synthetic released public dayli.")).toBeVisible();
  expect((await restrictedVisitor.request.get(publicPost.media[0]!.url)).status()).toBe(200);
  const archiveBeforeTrash = await restrictedVisitor.request.get(`${apiOrigin}/api/v1/profiles/${username}/posts`);
  expect(JSON.stringify(await archiveBeforeTrash.json())).toContain(postId);
  const trashed = await page.evaluate(async ({ api, id }) => fetch(`${api}/api/v1/posts/${id}/trash`, { method: "POST", credentials: "include" }).then((response) => response.status), { api: apiOrigin, id: postId });
  expect(trashed).toBe(200);
  for (const url of [`${apiOrigin}/api/v1/posts/${postId}`, publicPost.media[0]!.url]) {
    expect((await restrictedVisitor.request.get(url)).status()).toBe(404);
  }
  for (const route of [
    `/api/v1/posts/${postId}/revisions`,
    `/api/v1/posts/${postId}/likes`,
    `/api/v1/posts/${postId}/comments`,
  ]) expect((await page.request.get(`${apiOrigin}${route}`)).status()).toBe(404);
  const archiveAfterTrash = await restrictedVisitor.request.get(`${apiOrigin}/api/v1/profiles/${username}/posts`);
  expect(archiveAfterTrash.status()).toBe(200);
  const archiveAfterTrashBody = JSON.stringify(await archiveAfterTrash.json());
  expect(archiveAfterTrashBody).not.toContain(postId);
  expect(archiveAfterTrashBody).not.toContain("Synthetic released public dayli.");
  await restrictedVisitor.reload();
  await expect(restrictedVisitor.getByText("Synthetic released public dayli.")).toHaveCount(0);
  await restrictedVisitor.goBack();
  await expect(restrictedVisitor).toHaveURL(new RegExp(`/u/${username}$`));
  await expect(restrictedVisitor.getByRole("heading", { name: "Public E2E" })).toBeVisible();
  await expect(restrictedVisitor.getByText("Synthetic released public dayli.")).toHaveCount(0);
  expect(await restrictedVisitor.locator("body").innerText()).not.toContain("Synthetic released public dayli.");
  await restrictedVisitor.goForward();
  await expect(restrictedVisitor).toHaveURL(new RegExp(`/u/${username}/${postId}$`));
  await expect(restrictedVisitor.getByText(/isn't available|not found/i)).toBeVisible();
  expect(await restrictedVisitor.locator("body").innerText()).not.toContain("Synthetic released public dayli.");

  await Promise.all([anonymous.close(), restrictedContext.close()]);
});

test("friend intent signs in, refetches, and mutates only after confirmation", async ({ browser, page }, testInfo) => {
  const fixture = await setupIntentFixture(browser, page, testInfo, false);
  const raw = `/u/${fixture.author}?intent=friend-request`;
  const requests = () => Number(database(`select count(*) from friend_requests where sender_id = '${fixture.viewerId}' and recipient_id = '${fixture.authorId}'`));
  expect((await fixture.page.request.get(`${process.env.E2E_API_ORIGIN}/api/v1/profiles/${fixture.author}`)).status()).toBe(200);
  await fixture.page.goto(`/u/${fixture.author}`);
  await fixture.page.getByRole("link", { name: "add friend" }).click();
  await signInFromIntent(fixture.page, fixture.viewerEmail, fixture.password, new RegExp(`/u/${fixture.author}$`));
  await expect(fixture.page.getByText(/Review this profile/)).toBeVisible();
  expect(requests()).toBe(0);
  await fixture.page.getByRole("button", { name: "add friend" }).click();
  await expect.poll(requests).toBe(1);
  await proveConsumed(fixture.page, raw, /Review this profile/, requests);
  await fixture.anonymous.close();
});

test("message intent signs in and creates one request only after send", async ({ browser, page }, testInfo) => {
  const fixture = await setupIntentFixture(browser, page, testInfo, false);
  const raw = `/u/${fixture.author}?intent=message-request`;
  const messageBody = `Explicit message request ${fixture.viewer}.`;
  const messages = () => Number(database(`select count(*) from messages m join conversations c on c.id = m.conversation_id where m.sender_id = '${fixture.viewerId}' and m.body = '${messageBody}' and c.user_low_id = least('${fixture.authorId}', '${fixture.viewerId}') and c.user_high_id = greatest('${fixture.authorId}', '${fixture.viewerId}')`));
  await fixture.page.goto(`/u/${fixture.author}`);
  await fixture.page.getByRole("link", { name: "message" }).click();
  await signInFromIntent(fixture.page, fixture.viewerEmail, fixture.password, new RegExp(`/u/${fixture.author}$`));
  await expect(fixture.page.getByText(/Review this profile/)).toBeVisible();
  expect(messages()).toBe(0);
  await fixture.page.getByRole("link", { name: "message", exact: true }).click();
  expect(messages()).toBe(0);
  await fixture.page.getByRole("textbox", { name: "Message" }).fill(messageBody);
  await fixture.page.getByRole("button", { name: "send", exact: true }).click();
  await expect.poll(messages).toBe(1);
  const clientMessageId = database(`select m.client_message_id from messages m join conversations c on c.id = m.conversation_id where m.sender_id = '${fixture.viewerId}' and m.body = '${messageBody}' and c.user_low_id = least('${fixture.authorId}', '${fixture.viewerId}') and c.user_high_id = greatest('${fixture.authorId}', '${fixture.viewerId}')`);
  expect(clientMessageId).not.toBe("");
  const exactMessage = () => Number(database(`select count(*) from messages where sender_id = '${fixture.viewerId}' and body = '${messageBody}' and client_message_id = '${clientMessageId}'`));
  expect(exactMessage()).toBe(1);
  await fixture.page.goto(raw);
  await expect(fixture.page.getByText(/Review this profile/)).toHaveCount(0);
  expect(messages()).toBe(1);
  expect(exactMessage()).toBe(1);
  await fixture.anonymous.close();
});

test("like intent signs in and writes exactly once after an explicit click", async ({ browser, page }, testInfo) => {
  const fixture = await setupIntentFixture(browser, page, testInfo, true);
  const path = `/u/${fixture.author}/${fixture.postId}`;
  const raw = `${path}?intent=like`;
  const likes = () => Number(database(`select count(*) from post_likes where post_id = '${fixture.postId}' and user_id = '${fixture.viewerId}'`));
  await fixture.page.goto(path);
  await fixture.page.getByRole("link", { name: "like" }).click();
  await signInFromIntent(fixture.page, fixture.viewerEmail, fixture.password, new RegExp(`${path}$`));
  expect(likes()).toBe(0);
  await fixture.page.getByRole("button", { name: "Like" }).click();
  await expect.poll(likes).toBe(1);
  await fixture.page.reload();
  await fixture.page.goBack();
  await fixture.page.goForward();
  await fixture.page.goto(raw);
  expect(likes()).toBe(1);
  await fixture.anonymous.close();
});

test("comment intent signs in, focuses once, and posts exactly once after send", async ({ browser, page }, testInfo) => {
  const fixture = await setupIntentFixture(browser, page, testInfo, true);
  const path = `/u/${fixture.author}/${fixture.postId}`;
  const raw = `${path}?intent=comment`;
  const comments = () => Number(database(`select count(*) from post_comments where post_id = '${fixture.postId}' and author_id = '${fixture.viewerId}' and deleted_at is null`));
  await fixture.page.goto(path);
  await fixture.page.getByRole("link", { name: "comment" }).click();
  await signInFromIntent(fixture.page, fixture.viewerEmail, fixture.password, new RegExp(`${path}$`));
  const composer = fixture.page.getByRole("textbox", { name: "Add a comment" });
  await expect(composer).toBeFocused();
  expect(comments()).toBe(0);
  await composer.fill("Explicit returned comment.");
  await fixture.page.getByRole("button", { name: "Post", exact: true }).click();
  await expect.poll(comments).toBe(1);
  await fixture.page.reload();
  await fixture.page.goBack();
  await fixture.page.goForward();
  await fixture.page.goto(raw);
  await expect(composer).not.toBeFocused();
  expect(comments()).toBe(1);
  await fixture.anonymous.close();
});
