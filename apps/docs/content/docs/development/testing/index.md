---
title: Testing
description: Choose the smallest useful Dayli test, then run the full local checks before review.
---

# Testing

We wouldn't want someone's daily reflection to disappear because we changed a button. Or let them post twice because we fixed something completely unrelated. A working app is a pretty good feature to have.

Testing helps us check that the app does what we expect and keeps doing it as we change the code. An automated test sets up a situation, runs some part of the app, and checks the result. Once we've written it, we can repeat that check without clicking through everything by hand.

So why have several layers? A function can work on its own while the screen using it is broken. The screen can look right while the API rejects its request. And everything can work locally while the deployed app has the wrong configuration.

Take posting a dayli. A small test can check that the posting rules reject a second post. A database test can check that two requests arriving together still can't save two posts for the same day. A browser test can check that someone can fill in the form and submit it. Each one catches a different way the feature could break.

Tests don't guarantee a bug-free app, but they give us repeatable checks instead of just hoping it still works.

Run commands on this page from the repository root unless a command starts with `cd`.

## Choose the check you need

For a small change, start with the narrowest relevant test:

1. Run the changed unit, route, or component test while you work.
2. Add the next boundary when your change depends on PostgreSQL, workerd, a browser, or a Flutter device.
3. Run `pnpm verify:local` before opening a pull request. It is the broad local verification required by `CONTRIBUTING.md`.
4. Use a reviewed staging workflow only when the result depends on deployed Cloudflare or Neon resources.

Here are the usual choices.

| Test category | What it checks | Safe command | Runtime and limits |
| --- | --- | --- | --- |
| Domain units | Check a small business rule on its own. For example, work out which Auckland day a timestamp belongs to. | `pnpm --filter @dayli/domain test` | Node and `tsx`. No database, Worker, browser, or network. |
| API service and route tests | Check how the backend handles a request, using controlled replacements for its dependencies. For example, reject a second daily post. | `pnpm --filter @dayli/api test` | Vitest in the Cloudflare Workers test runtime. The normal config excludes `*.integration.test.ts`, staging tests, and workerd tests. |
| Web components | Check a piece of the web interface without opening a real browser. For example, show the right profile link after a username search. | `pnpm --filter @dayli/web test` | Vitest, jsdom, and React Testing Library. This does not start Next.js or a real browser. |
| Flutter unit and widget tests | Check mobile logic and pieces of the interface without running on a device. For example, show an empty-feed message when there are no posts. | `cd apps/mobile && flutter test` | Flutter's host test runtime. Platform plugins are faked where needed, and no device or deployed API is involved. |
| PostgreSQL integration | Check that backend code and a real database work together. For example, prevent two simultaneous requests from saving duplicate posts. | `bash scripts/verify-postgres.sh` | Docker with Compose and a disposable PostgreSQL fixture. The script uses test databases and removes its own volumes. It does not use the persistent development database. |
| Worker realtime and proxy runtime | Check code that depends on Cloudflare's local runtime. For example, reject a request with an invalid browser-proxy source. | `pnpm --filter @dayli/api test:realtime`<br />`pnpm --filter @dayli/api test:proxy-integration`<br />`pnpm test:proxy-provenance` | Local Cloudflare Vitest and workerd runtimes. These prove local Worker behavior, not ownership of headers at the deployed Cloudflare edge. |
| Generated contracts | Check that generated API descriptions and clients still match the backend definitions. For example, detect an outdated client after a request field changes. | `pnpm generate:clients:check` | Node, pnpm, Dart, and the OpenAPI generator. This regeneration and diff check is a contract check, not a behavioral journey through an app. |
| Web end-to-end | Check a user journey through the running web app in a real browser. For example, create an account and open a signed-in page. | `pnpm test:e2e:web` | Docker, OpenSSL, curl, Node, pnpm, and installed Playwright Chromium. The script starts an isolated HTTPS API, Next.js app, and disposable PostgreSQL fixture. It does not contact staging. |
| Flutter integration and device | Check a journey through the built mobile app. Our current test uses fake services to check signed-in navigation. | `cd apps/mobile && flutter test integration_test/auth_navigation_smoke_test.dart -d <device-id>` | A selected Flutter device or emulator. The current smoke uses fake app services, so it does not prove a real API connection, platform sign-in, or push delivery. |
| Staging checks | Check deployed services and configuration. For example, confirm the staging Worker reaches PostgreSQL through Hyperdrive with the expected role. | Use the dedicated, reviewed GitHub staging workflow | These checks require protected credentials and deployed resources. Local workflow contract commands do not contact staging. There is no general load-test command. |
| Synthetic staging journey | Check a small deployed user journey periodically. Dayli's implemented journey signs in through the staging web interface, checks the session, and signs out. | Dispatch `Staging authentication smoke` from GitHub Actions on `main` | Uses a dedicated staging account and fixed target. Automatic hourly and post-release runs depend on an owner-controlled activation variable. It is not a production or load test. |

Install Chromium once before the web end-to-end suite if it is not already present:

```bash
pnpm --filter @dayli/web exec playwright install chromium
```

## Where Dayli uses these tests

Different features need different checks. Here are some places to look when you want to see how we use these layers:

- **Daily posting rules:** Domain unit tests check Auckland dates in `packages/domain/src/auckland-day.test.ts`. API service tests check whether a second post is rejected in `apps/api/src/features/posts/create-post/__tests__/create-post.service.test.ts`.
- **Finding friends and reading posts:** Web component tests cover username search in `apps/web/components/ui/layout/NavSearch.test.tsx`. Flutter widget tests cover displaying and paging the feed in `apps/mobile/test/home_feed_test.dart`.
- **Saving and protecting data:** API repository integration tests live under their owners' `__tests__` folders as `*.repository.integration.test.ts`. They check queries against PostgreSQL rather than assuming an in-memory replacement behaves like the database. See [PostgreSQL integration tests](./integration-tests).
- **Worker-specific behaviour:** The API's realtime and proxy test configurations cover code that needs the local Worker runtime. The browser-proxy checks start from `scripts/test-browser-proxy-workerd.sh`. See [Worker runtime tests](./worker-runtime-tests).
- **Keeping apps compatible with the API:** Contract definitions and generated clients live under `packages/contracts`, `packages/api-client-typescript`, and `packages/api-client-dart`. Generation checks catch files that are no longer in sync. See [contracts and generated clients](./contracts-and-generated-clients).
- **Moving through the app:** Web browser journeys are run by `scripts/test-web-e2e.sh`. Mobile's current navigation smoke is in `apps/mobile/integration_test/auth_navigation_smoke_test.dart`; it uses fake services, not a live sign-in. See [end-to-end tests](./end-to-end-tests).
- **Checking deployed resources:** The coordinated release and Hyperdrive proof run through dedicated staging workflows. Manual checks use approved synthetic accounts and record sanitized evidence. See [staging and manual checks](./staging-and-manual-checks).
- **Checking deployed sign-in periodically:** The staging authentication smoke opens the deployed site in Chromium, checks protected navigation and session behavior, then signs out. See [synthetic testing](./synthetic-testing).

These are starting points, not a list of every test. Each guide starts with the feature problem that its test layer can answer.

## `pnpm test` and `pnpm verify:local` are different

`pnpm test` recursively runs each workspace package that declares a `test` script. Today that includes the domain tests, ordinary API tests, database package tests, and web tests.

Some database package files are integration tests gated by environment variables and connection URLs. With an ordinary `pnpm test`, those suites skip when the local test database variables are absent. The API's ordinary Vitest config excludes its integration files too. A skipped integration suite is not evidence that PostgreSQL behavior passed. Use `bash scripts/verify-postgres.sh` for that evidence.

`pnpm verify:local` is much broader. It checks the required tool versions, installs locked dependencies, runs lint and type checks, runs the workspace tests, exercises local Worker proxy checks, builds the packages, regenerates API clients, checks the generated Dart package, runs Flutter tests, and finally runs the isolated PostgreSQL verifier.

```bash
pnpm verify:local
```

Commands such as `pnpm test:staging-release-contract` and `pnpm test:staging-auth-smoke-contract` test deployment scripts and workflow rules with local fixtures. Despite their names, they do not contact staging and are not live staging checks.

The full mode adds a debug Android APK build:

```bash
pnpm verify:local:full
```

Building an APK proves that the Android artifact compiles. It does not install the app or run an integration test on a device. Likewise, lint, type checks, generated-file checks, and builds are useful verification, but they are not behavioral tests.

## Keep test data in the right place

Dayli uses three separate kinds of data:

- Test fixtures are disposable data created by automated tests. The PostgreSQL and web end-to-end scripts own isolated Compose projects and clean them up.
- Development data belongs to your persistent local setup on port `5434`. It includes the accounts and posts you create while developing.
- Staging data belongs to the shared deployed environment. Use only approved synthetic accounts and content there.

The test database normally uses port `5433`. Do not change test URLs to point at the development database, Neon, or another shared database. The integration guards reject several unsafe targets, but the command and environment still need review.

## Read the detailed guides

- [Unit and component tests](./unit-and-component-tests)
- [PostgreSQL integration tests](./integration-tests)
- [Worker runtime tests](./worker-runtime-tests)
- [Contracts and generated clients](./contracts-and-generated-clients)
- [End-to-end tests](./end-to-end-tests)
- [Staging and manual checks](./staging-and-manual-checks)
- [Synthetic testing](./synthetic-testing)

Each page explains what can fail at that boundary, where Dayli tests it, which command is safe to run, and what a passing result still does not prove.
