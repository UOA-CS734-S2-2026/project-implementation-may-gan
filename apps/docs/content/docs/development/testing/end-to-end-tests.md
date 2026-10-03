---
title: End-to-end tests
description: Run Dayli web journeys through local HTTPS services and understand the current mobile smoke boundary.
---

# End-to-end tests

A sign-in form can pass its component tests while the complete journey is still broken. The browser might lose the protected return path, the API might set the wrong cookie, or the web proxy might send the request to the wrong place. Those pieces only meet when the app, API, and database run together.

End-to-end tests follow a user-visible journey through the assembled application. They are broader and slower than unit tests, so use them for paths where the connections matter. A failed journey tells you that the feature does not work as a whole, then narrower tests help find which boundary failed.

Dayli's current web suite uses real local services. Its current Flutter integration smoke uses fake services on a device. Those tests share a category because they drive an assembled interface, but they do not provide the same evidence.

## Where Dayli uses these tests

The web runner is `scripts/test-web-e2e.sh`, with Playwright configuration in `apps/web/playwright.config.ts`. Current browser journeys live in `apps/web/e2e/`:

- `authenticated-home.spec.ts` signs up, signs out, returns through a protected settings link, signs in, and reloads the session.
- `messaging.spec.ts` creates two accounts and checks message requests, acceptance, live delivery, reactions, multiline messages, and unread state.
- `messaging-polish.spec.ts` covers message interface behavior that needs a browser.
- `auth-legal-links.spec.ts` and `legal-pages.spec.ts` check public legal links and pages.

The mobile integration entry point is `apps/mobile/integration_test/auth_navigation_smoke_test.dart`. Its service replacements come from `apps/mobile/test/support/fakes.dart`.

## Run the web journeys

Install Chromium once if Playwright has not installed it on your machine:

```bash
pnpm --filter @dayli/web exec playwright install chromium
```

Docker must be running. Then run the complete suite from the repository root:

```bash
pnpm test:e2e:web
```

To focus on one file, pass Playwright's file argument through the root script:

```bash
pnpm test:e2e:web -- e2e/authenticated-home.spec.ts
```

The shell runner checks for `curl`, Docker with Compose, OpenSSL, pnpm, and Node. It then:

1. Chooses free local ports and creates a temporary self-signed certificate.
2. Starts a uniquely named PostgreSQL Compose project and applies migrations.
3. Starts the API with Wrangler over local HTTPS and an E2E-only auth secret.
4. Starts Next.js over local HTTPS and points it at that API.
5. Waits for both services, then runs Playwright.
6. Stops both process trees, removes the Compose volumes, and deletes the temporary directory through an exit trap.

The runner does not use developer, staging, or production credentials. On failure it prints the last 100 lines of the temporary API and web logs before deleting the directory. Playwright runs each spec in `desktop-chromium` and `mobile-chromium`, with one worker and no full parallelism. Its normal configuration retains a trace on failure, and CI also configures an HTML reporter. Treat those local or CI browser artifacts as test data because they can contain the journey's generated account details.

## Example: return to the protected page after sign-in

Someone who opens `/settings` while signed out should land on sign-in, then return to settings after authenticating. A route-guard unit test can check the `next` value, but it cannot prove that the browser form, session cookie, API, and redirect use it together.

`authenticated-home.spec.ts` first creates a real account in the disposable database. Later it signs out, opens `/settings`, signs back in, and checks the destination:

```ts
await page.goto("/settings");
await expect(page).toHaveURL(/\/sign-in(?:\?|$)/);
await page.getByLabel("Email").fill(email);
await page.getByLabel("Password").fill(password);
await page.getByRole("button", { name: "Sign in", exact: true }).click();
await expect(page).toHaveURL(/\/settings$/);
await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
```

The test reloads afterward and checks the signed-in content again. That catches a session which works for one navigation but is not persisted.

The messaging journey goes further. It creates separate browser contexts for two accounts, then checks that a reply and reaction appear in the other person's already-open page. This is an appropriate end-to-end case because the API, realtime Worker behavior, browser state, and rendered interface all contribute to the result.

## Run the current Flutter integration smoke

Choose a Flutter device or emulator, then run:

```bash
cd apps/mobile
flutter devices
flutter test integration_test/auth_navigation_smoke_test.dart -d <device-id>
```

The test opens `DayliApp`, enters an example email and password, submits the sign-in form, and expects the empty home state. It uses `TestHarness` fake services. No deployed API, real email account, platform sign-in provider, or push service is involved.

That makes the smoke useful for checking that the built app can move through the current signed-in navigation on the selected device. It is not a live mobile authentication test. A successful run also says nothing about another platform or physical device that was not selected.

## Add a journey when the connections matter

Start with one concrete user failure and cover the shortest path that would expose it. Prefer roles, labels, visible text, and stable URLs over DOM structure. Create accounts and records through the interface when that setup is part of the behavior under test.

Keep the journey independent. The local web script owns a fresh database volume, but specs should still generate unique usernames and close extra browser contexts in `finally`. Avoid ordering tests so one spec relies on another spec's account.

Do not put every validation branch into Playwright. A browser journey is expensive and broad. Keep input edge cases in unit or component tests, repository races in PostgreSQL integration tests, and one representative connected path here.

## Limits

The web suite proves the application against local Wrangler, Next.js, Chromium, and PostgreSQL. It does not prove deployed Cloudflare routes, Neon connectivity, email delivery, Google OAuth, production data, or browser engines other than Chromium. The mobile smoke currently proves navigation with fake services, not a live backend journey.

Use [synthetic testing](./synthetic-testing) for the implemented deployed staging authentication journey. Dayli has no general live mobile end-to-end suite and no production browser journey. Do not point the local E2E runner at a shared environment or reuse its generated credentials outside its disposable fixture.
