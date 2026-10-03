---
title: Synthetic testing
description: Understand Dayli's implemented staging authentication monitor, its safety controls, and its current limits.
---

# Synthetic testing

A health endpoint can return `200` while sign-in is broken. The landing page may load even though the protected-page redirect loses its return path, the session cookie has the wrong attributes, or sign-out leaves another tab authenticated.

A synthetic test checks a small deployed user journey on a schedule. It behaves like a controlled user, using a dedicated account and known steps, so it can catch failures in the running web app and its deployed configuration. Dayli has an implemented synthetic authentication journey for staging.

"Synthetic" describes the journey and its controlled account. It is not the same as synthetic test data inside a local unit test. It is also not a mocked check. This browser opens the deployed staging site and uses the real staging authentication path.

## Where Dayli uses these tests

The implementation has three main sources:

- `.github/workflows/staging-auth-smoke.yml` defines the protected staging workflow, triggers, permissions, credentials, and runtime limit.
- `apps/web/scripts/staging-auth-smoke.mjs` contains the fixed-origin Playwright journey and allowlisted reporting.
- `scripts/staging-auth-smoke.test.mjs` checks the journey, privacy behavior, cleanup, origin restrictions, and workflow contract with local fixtures.

The design and validation record is `docs/implementation/staging-auth-smoke-tests.md`. Release attribution comes from `.github/workflows/staging-release.yml` and is validated by `scripts/validate-staging-auth-attribution.mjs` before a post-release smoke receives staging credentials.

## What the journey checks

The runner uses one fresh, headless Chromium context and a dedicated staging account. It:

1. Opens the public staging landing page.
2. Opens `/settings?smoke=auth` while signed out.
3. Confirms the app redirects to sign-in and preserves that exact return path.
4. Signs in through the email and password interface.
5. Confirms the Settings heading, reloads, and checks the same protected page again.
6. Opens a second tab in the same browser context and confirms that the session works there.
7. Checks the exact `__Secure-better-auth.session_token` cookie name and its Secure, HttpOnly, SameSite, host, and path attributes in memory.
8. Signs out and confirms that both tabs lose protected access.

If a failure happens after credential submission, cleanup attempts one UI sign-out for that browser context. A cleanup failure keeps the run failed. The journey does not create posts, friendships, messages, password resets, or account changes.

## When it can run

The workflow is named `Staging authentication smoke`. It has three entry points:

- a manual dispatch from `main`
- an hourly GitHub Actions schedule at minute 17
- completion of a successful `Deploy coordinated staging release` run from the approved same-repository `main` paths

The schedule is best effort. GitHub Actions does not promise execution at an exact minute, so this is not an uptime service-level agreement.

Manual dispatch can run while automation is disabled. Scheduled and post-release jobs require the repository Actions variable `STAGING_AUTH_SMOKE_AUTOMATION_ENABLED` to equal `true`. The source does not reveal the current repository variable value or current workflow health. Check the Actions settings and recent `Staging authentication smoke` runs before saying that monitoring is active or passing.

Do not enable automation merely because the workflow exists. Activation requires an inspected successful manual run and owner approval. The implementation record contains historical local and hosted evidence, but that record does not establish the current deployed state.

## Credentials and account safety

The job uses the GitHub `staging` environment and reads only these credentials for the browser step:

- `SMOKE_TEST_EMAIL`
- `SMOKE_TEST_PASSWORD`

They must belong to a disposable, approved staging-only account. Do not use a personal account, a production account, or credentials shared with another test. Runs share the non-cancelling `staging-auth-smoke` concurrency group so two journeys do not overlap and interfere with the account's session cleanup.

The workflow has `actions: read` and `contents: read` permissions, a ten-minute job timeout, and no dispatch inputs. Post-release execution checks out trusted current `main`, not code from the triggering run. It validates the upstream workflow, repository, branch, event, conclusion, and release-attribution format before the credentialed step.

Never run the browser script directly with copied staging credentials. Use the reviewed GitHub workflow so environment controls, fixed code revision, concurrency, and sanitized reporting remain in place. Do not ask someone to paste either secret into a terminal, issue, or chat.

## Fixed destinations

The runner hard-codes one application origin:

```text
https://staging.dayli.agroupforcoders.com
```

It accepts no target URL from the workflow or command line. Every application navigation and request must stay on that origin.

Cloudflare injects one analytics loader into public pages. The runner recognizes only a tightly matched HTTPS `GET` script request to `static.cloudflareinsights.com` with a versioned `/beacon.min.js/v...` path, no query, the default port, and no navigation. It aborts that request without failing the phase. Any other off-origin request is aborted and fails the phase as `unexpected_host`.

These restrictions keep credentials and session requests from being sent to an arbitrary destination. If staging legitimately adds another host, update the runner and its negative contract tests through review. Do not add a broad wildcard.

## Reports, artifacts, and alerts

The runner prints only fixed step labels, outcome, duration, and an allowlisted failure category. Examples of categories include `credentials_missing`, `return_path_lost`, `login_failed`, `session_cookie_missing`, `session_cookie_attributes`, `logout_failed`, `unexpected_host`, and `cleanup_failed`.

It does not print caught browser errors, locator values, request URLs, email addresses, passwords, cookies, tokens, or response bodies. It does not configure screenshots, video, traces, HAR files, storage state, or a Playwright reporter. The workflow has no artifact-upload step for the browser run, so it sets no browser-artifact retention period. The one-day release-attribution artifact belongs to the coordinated release workflow and contains only release and automation SHAs.

A failed job remains failed. Existing alerting is GitHub Actions notifications, which depend on repository and user notification settings. There is no separate pager, webhook, repeated-failure escalation, or synthetic monitoring dashboard in this implementation. Do not document one until it exists.

## Diagnose a failure safely

Start with the fixed category and the named `journey` or `cleanup` step. Check whether the coordinated staging release and public site are otherwise available. Reproduce the relevant logic with the local contract suite when possible:

```bash
pnpm test:staging-auth-smoke-contract
```

That command is safe to run locally. It uses fixtures and does not contact staging or require credentials.

Do not add raw Playwright errors, screenshots, network archives, browser console dumps, or verbose request logging to a credentialed run. Those can expose filled form content or session data. If the allowlisted category is not enough, add a new non-sensitive category and a fixture that proves it cannot leak credentials.

## What this synthetic test does not cover

The current journey covers staging web email and password authentication only. It does not check signup, mailbox delivery, email verification, password reset, Google OAuth, real session expiry, independent session revocation, native mobile authentication, WebSockets, R2 media, posting, relationships, or messaging.

It does not run against production, and no production synthetic workflow exists. It is one small periodic journey, not a load test. Running it more often or in parallel would not create useful capacity evidence and could trigger authentication limits or make account cleanup unreliable.

Add another synthetic journey only after its account, allowed actions, destinations, cleanup, logs, schedule, and failure ownership are approved. Until then, use local tests and a recorded manual staging check for unsupported paths.
