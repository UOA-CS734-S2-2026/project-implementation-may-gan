# Specification: Staging push infrastructure and release evidence

**Status:** Approved 2026-10-03.  
**Brief:** [brief.md](brief.md)

**Approval:** User approved this specification and its blocking two-second p95 staging gate during the AGaw planning session on 2026-10-03.

## Problem

The repository contains messaging push delivery code and local/mock test evidence, but staging Firebase/APNs configuration, device validation, and full deployed release evidence are incomplete. Mobile users cannot rely on notifications, and release owners cannot accurately state that background delivery, privacy, recovery, or staging performance is ready. #131 comments record a no-push staging rollout, not authenticated phone-to-browser or physical-device acceptance.

## Success

Staging has protected, verified push prerequisites; Android and iOS prove the required notification lifecycle using the generic notification platform; and release evidence demonstrates safe deployed messaging behavior. Missing evidence, failed privacy checks, or latency above the agreed threshold blocks the release.

## Actors and responsibilities

- The staging owner configures Firebase, APNs, the protected GitHub Environment secret, and the Cloudflare-only encryption key.
- The generic notification platform provides event delivery, foreground banners, preview behavior, and authenticated tap handling.
- Mobile validation owners perform Android and iOS physical-device scenarios.
- Release owners record evidence and decide whether to proceed.

## Required behavior

### #141, infrastructure readiness

- The staging owner provisions the required Firebase/APNs and mobile application configuration without committing credentials or resource IDs.
- `FCM_SERVICE_ACCOUNT_JSON` is managed only in the protected staging GitHub Environment. `PUSH_TOKEN_ENCRYPTION_KEY` is provisioned only in the exact Cloudflare Worker and routine deployment does not overwrite it.
- Readiness validates secret presence by name, safely parses the service-account document, and obtains a Firebase OAuth token. It does not call the FCM message-send API.
- A malformed, absent, or unavailable prerequisite disables notification delivery without blocking REST or realtime messaging.
- Evidence is sanitized and contains no credential values, tokens, project IDs, account IDs, message text, or private screenshots.

### #130, physical-device acceptance

After #141 and the generic notification platform are ready, Android and iOS each prove:

- permission denial, no repeated prompting, and continued foreground functionality;
- registration, token refresh, logout, session expiry, and account replacement isolation;
- foreground OS banner presentation;
- background and terminated OS notification presentation;
- notification preview rules from the generic-notifications specification;
- authenticated, authorized taps and safe stale-target fallback;
- no duplicate presentation from foreground local and provider OS paths.

### #131, deployed release gate

The release evidence records deployed two-user browser/mobile messaging, reconnect/catch-up behavior, old edits and unsends, no periodic polling, logout and account-switch privacy, Android/iOS push evidence, additive rollout, FCM-disable rollback, failed-job handling, and safe operational logging.

Staging commit-to-visible latency must be at or below **two seconds p95** under a documented synthetic two-user workload. Missing measurement or a failed threshold blocks the release.

## Failure and edge cases

- A notification delivered after logout, account replacement, session expiry, target deletion, cancellation, block, or revoked authorization cannot expose cached private content. It resolves the current session and authorized target first.
- A missing FCM secret or encryption key disables only notification delivery.
- An OAuth readiness pass is not provider-send or physical-device proof.
- A stale or unauthorized tap lands on a safe relevant root route without private data.
- Removing or disabling FCM configuration leaves accepted messages, REST, and realtime available.

## Nonfunctional requirements

- Secrets never enter source, generated configuration, tickets, logs, traces, or evidence.
- Evidence is tied to the deployed commit and mobile build version and records scenario results, timestamps, aggregate latency, outbox observations, and rollback result.
- Notification delivery does not promise exact once-only OS presentation.

## Compatibility and dependencies

`#141 -> generic notification platform -> #130 -> #131`. Existing legacy message-only devices remain supported according to the generic-notifications rollout policy. Browser push and production deployment are excluded.

## Out of scope

A generic notification system implementation, browser push, secret rotation, production launch, and provider/device claims from local tests.

## Resolved decisions

#141 is OAuth/configuration-only, foreground requires an OS banner, and the two-second p95 staging target is a blocking release gate.

## Unresolved questions

None affecting expected behavior. External staging-resource state, approved test accounts, and physical-device availability remain external prerequisites to verify.
