# Experience E2E coverage plan

This plan covers the responsive website and the native Flutter app at the user-journey level. It keeps browser and native checks separate because they need different runtime environments and different evidence.

## What this PR adds

The first web slice proves that a new person can use the real local app stack:

1. Open the landing page.
2. Create an email and password account through Better Auth.
3. Receive the API session and enter the protected home page.
4. See account identity in the navigation.
5. On the mobile browser project, open the mobile navigation and enter the friends page.
6. Visit Settings, sign out, and confirm Settings requires sign-in again.
7. Sign back in with the same account, reload Settings, and see the account again.

Settings has no link in the current web navigation, so the test opens its URL directly. It still checks access through the page and does not inject a session.

`apps/web/playwright.config.ts` runs this journey in desktop Chromium and Pixel 7 Chromium projects. `pnpm test:e2e:web` invokes `scripts/test-web-e2e.sh` once per browser project, giving each project a separate self-signed HTTPS API Worker, HTTPS Next development server, and new PostgreSQL Compose project. This keeps the real Better Auth rate limit intact while each project uses its own disposable synthetic account. Each invocation migrates its database before Playwright starts, then removes its containers, volume, Worker state, certificate, and logs when it exits.

The script only uses the local `postgres:18` fixture in `packages/db/docker-compose.yml`, its `migrator` and restricted `app` roles, and a test-only Better Auth secret. It has no staging URL, deployment, secret, or production database path. The GitHub Actions `Web E2E` job installs Chromium and runs the same script.

Run it locally after installing Chromium:

```bash
pnpm --filter @dayli/web exec playwright install chromium
pnpm test:e2e:web
```

Docker, Docker Compose, curl, OpenSSL, and pnpm must be available. The script asks the operating system for unused local ports. It intentionally does not use `pnpm local:auth:setup`, mkcert, or a developer database.

## Legal draft E2E slice

The legal frontend PR adds a separate browser journey in `apps/web/e2e/legal-pages.spec.ts`. It runs against the same disposable HTTPS API Worker, PostgreSQL database, and real Next server as the account journey. It does not mock the legal renderer or inject a browser session.

The journey runs on desktop Chromium and Pixel 7 Chromium. It covers direct `/privacy` and `/terms` access while signed out, draft notice and version visibility, readable content without horizontal overflow, the default theme, cross-document links, landing and sign-in links, browser back navigation preserving an unsubmitted sign-in form, and signed-in Settings links after a real email/password registration. It clears the real browser cookie jar before a final direct Terms visit to cover a missing-session route without pretending that a static legal link is accepted Terms.

Run it with the normal disposable-stack command:

```bash
pnpm --filter @dayli/web exec playwright install chromium
pnpm test:e2e:web
```

`apps/mobile/integration_test/legal_navigation_integration_test.dart` is an offline native legal-reading journey. It constructs the real router, `SessionController`, protected token and identity stores, generated API clients, and bundled assets. It intentionally points at an unused loopback origin, clears the protected session first, and never changes machine networking. It proves legal content is available without a network request or active session, and that a real app instance preserves an unsubmitted sign-in email after returning from Privacy.

`scripts/test-mobile-legal-e2e.sh` adds the separate Android live-backend journey. It starts an isolated PostgreSQL fixture and Better Auth Worker, maps only the random local Worker port through `adb reverse`, and supplies the existing mkcert root only to the debug test process. `apps/mobile/integration_test/legal_backend_integration_test.dart` uses real `AppServices`, router, storage, generated clients, and Better Auth to create an email/password account, restore its session after an app restart, open both policies from Settings, sign out, read a public policy, preserve an unsubmitted sign-in form through Privacy, and sign in again. It does not mock session state or API authorization. Realtime is excluded because it needs a dedicated WebSocket fixture.

Run the offline journey on a booted Android emulator or iOS simulator, or the live journey on the Android emulator with the documented local HTTPS prerequisites:

```bash
cd apps/mobile
flutter test integration_test/legal_navigation_integration_test.dart -d <device-id>
cd ../..
scripts/test-mobile-legal-e2e.sh emulator-5554
```

The live journey does not prove Terms acceptance, deletion, export, Google sign-in, provider delivery, realtime, or lifecycle policy. Android emulator evidence is available. An iOS simulator is still required release evidence. A macOS desktop run can catch a native plugin or router regression, but it is not a substitute for either target.

## Web follow-up

Keep each addition focused on a complete experience instead of checking individual controls.

| Priority | Journey | Fixture and assertions |
| --- | --- | --- |
| Next | Find and add a friend | Create two disposable accounts through approved test setup, search for the other handle, send and accept the request in separate browser contexts, then confirm both circles update. |
| Later | Write and read a dayli | Seed a deterministic posting day and prompt, submit text without media, then verify the released result from the friend view. This needs an approved fixture for the time-dependent prompt. |
| Later | Direct messages | Use two isolated sessions to create a conversation, send a message, and reload the recipient inbox. Add live delivery only after a deterministic Worker durable object fixture is available. |
| Later | Media and external sign-in | Test uploads only against an isolated R2-compatible fixture. Google sign-in needs a dedicated OAuth client and callback origin, so it must not run against a shared account or client. |

The current first slice avoids posting because a stable daily-prompt seed is not part of the local browser fixture. It avoids media because the local Worker does not configure R2. It also avoids Google OAuth, email reset delivery, push delivery, and third-party writes.

Use unique accounts and a fresh database per run. Do not point browser tests at staging. Keep browser projects on desktop and a phone viewport for every web journey unless the experience is intentionally device-specific.

## Native Flutter plan

The legal-reading native integration journey is described above. `apps/mobile/integration_test/auth_navigation_smoke_test.dart` still boots `DayliApp` with `TestHarness` fakes and checks navigation after email and password entry. It is useful UI coverage, but it does not prove Better Auth, a real API session, or emulator networking. `docs/implementation/mobile-integration-tests.md` records the existing command and its constraints.

Build native experience coverage in these steps:

1. Keep fake-backed integration tests for launch, landing, auth navigation, composer drafts, and route recovery. Run them on Android and iOS simulators or emulators.
2. Extend the Android disposable Worker and PostgreSQL fixture to iOS after full Xcode, a Simulator runtime, and simulator CA trust are available. The fixture must continue to create or reset accounts without production credentials.
3. Extend the existing real Android email journey to iOS and add a dedicated protected-endpoint assertion and account-isolation coverage. Cover first-launch state and sign-out on both Android and iOS.
4. Add two-account friend, dayli, and messaging journeys. Test background and foreground recovery separately because the operating systems suspend apps differently.
5. Verify notifications on physical Android and iOS devices. FCM and APNs permissions, token rotation, and notification taps need device evidence that a simulator cannot provide.

Run emulator coverage in a dedicated manual or main-branch workflow until the project approves its hosted runner cost and isolated service configuration. Keep physical-device notification evidence outside ordinary pull request checks.

## Evidence and review rules

For any new E2E journey, record the command, browser or device target, API fixture, database lifecycle, and result. Do not claim a real native login when a test uses fakes. Do not add a hosted endpoint or long-lived test account to repository files. A failing browser run keeps Playwright trace data locally or in CI output, while the cleanup still removes the disposable services.
