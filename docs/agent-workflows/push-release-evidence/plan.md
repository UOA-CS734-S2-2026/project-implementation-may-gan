# Plan: Staging push infrastructure and release evidence

**Status:** Approved 2026-10-03.  
**Brief:** [brief.md](brief.md)  
**Specification:** [spec.md](spec.md)

**Approval:** User approved this plan, including OAuth-only readiness validation and feature-flag rollback, during the AGaw planning session on 2026-10-03.

## Current constraints and entry points

- `.github/workflows/staging-hyperdrive.yml` is manual from `main`, uses the protected `staging` Environment, validates configuration, dry-runs Wrangler, synchronizes allowlisted secrets, deploys the API Worker, and writes sanitized Hyperdrive evidence.
- `docs/implementation/staging-deployment.md`, `scripts/run-staging-api-deploy.mjs`, and the secret-sync script protect the Cloudflare-only encryption key from routine synchronization. They do not yet safely parse the FCM service account or obtain an OAuth token as a readiness check.
- `apps/api/src/infrastructure/jobs/messaging-delivery-runtime.ts` fails closed for push when either secret is absent, while the realtime handler remains independent.
- `apps/mobile/lib/notifications/firebase_push_source.dart` intentionally suppresses foreground OS presentation. Firebase mobile configuration, iOS push entitlement/capability, and physical-device proof are external prerequisites.
- `apps/api/wrangler.staging.example.jsonc` already runs the Worker cron every minute. `apps/api/src/index.ts` currently uses it only for messaging outbox repair.

## Proposed boundary

Keep the work separated by responsibility:

1. **#141 infrastructure readiness:** extend protected deployment validation with safe service-account structural validation and Firebase OAuth token acquisition. The check returns only sanitized pass/fail metadata and never calls the FCM send endpoint. It verifies the encryption-key binding name only and never reads or rotates its value.
2. **Generic notification platform:** implement separately under `../generic-mobile-notifications/`. It supplies publishers, capability-gated payloads, preview policy, foreground presentation, and tap routing.
3. **#130 device validation:** use a capable staging mobile build and approved accounts to validate the complete lifecycle on physical Android and iOS devices.
4. **#131 release evidence:** collect the cross-client functional, privacy, operational, latency, rollout, and rollback matrix. This is evidence work, not another implementation branch.

Add a server-side notification feature flag to the generic platform. It is the operational rollback mechanism. Do not rely on omitting the GitHub FCM secret because routine sync does not delete an already-present Worker secret.

## Staging readiness flow

```text
Protected GitHub Environment secret
  -> structural validation without output
  -> Firebase OAuth token request
  -> sanitized readiness artifact
  -> approved secret synchronization
  -> Worker deployment
  -> staging mobile registration and real events
  -> physical OS presentation and authenticated tap
```

The artifact identifies commit and mobile build version, scenario status, timestamps, aggregate latency, outbox observations, and feature-flag rollback result. It excludes secret names beyond approved binding names, credential values, tokens, resource IDs, account IDs, message content, and private screenshots.

## Rollout sequence

1. Apply reviewed additive database migrations for the notification platform.
2. Deploy compatible API/Worker code with notification publishers disabled.
3. Release a mobile build that registers notification-schema capability.
4. Complete #141 protected configuration and OAuth readiness.
5. Enable generic publishers for capable staging devices only.
6. Complete #130 device scenarios and #131 two-user deployed checks.
7. Require a documented synthetic two-user workload whose commit-to-visible p95 is at or below two seconds.
8. Enable or disable the feature through its server-side flag. Keep data and encryption bindings compatible during rollback.

## Test and evidence strategy

- Existing script tests: configuration validation, allowlisted secret synchronization, omitted secret behavior, generated Wrangler configuration, and dry runs.
- Add readiness tests that prove malformed service accounts fail safely and that OAuth results are sanitized.
- API/Worker tests that missing configuration suppresses push but preserves realtime delivery.
- Android and iOS physical evidence for permission denial, foreground banner, background/terminated notification, token rotation, logout, account replacement, expired session, stale target, and feature disable.
- Deployed two-user browser/mobile validation for messaging, reconnect catch-up, old changes, no polling, account isolation, outbox recovery, and rollback.
- Record latency sample setup and p95. A missing sample or p95 over two seconds fails #131.

## Risks

- External Firebase/APNs, device, signing, and staging-account prerequisites cannot be proved from this checkout.
- The current mobile configuration may not be suitable for release-candidate evidence until platform signing/capabilities are owner-configured.
- Secret synchronization and Worker deploy are not one transaction. A failed run can leave a changed secret without a new deployment, so owners must inspect sanitized binding state before retrying.
- Provider delivery can be at least once. The evidence must check duplicate-banner prevention rather than promise exactly once.
