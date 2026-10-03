# Brief: Push infrastructure and release evidence

**Status:** Approved 2026-10-03. This is a brief, not an implementation authorization.

## Sources

- [#141: Provision staging Firebase/APNs and Cloudflare push configuration](https://github.com/UOA-CS734-S2-2026/project-implementation-may-gan/issues/141)
- [#130: Validate Flutter FCM/APNs lifecycle on physical devices](https://github.com/UOA-CS734-S2-2026/project-implementation-may-gan/issues/130)
- [#131: Verify next-release messaging, recovery, and push gates](https://github.com/UOA-CS734-S2-2026/project-implementation-may-gan/issues/131)
- Background only, not an approved spec: `docs/implementation/messaging-implementation-handoff.md`

## Shared problem and impact

The repository has messaging push code and local tests, but no verified staging Firebase/APNs setup, physical-device evidence, or complete deployed release evidence. Users cannot yet rely on mobile notifications, and the release cannot honestly claim push or cross-device readiness.

## Intended outcome

Safely configure staging push, validate Android and iOS notification behavior, and collect deployment and operational evidence without exposing credentials or treating local tests as proof of device delivery.

## Current and desired behavior

| Source | Current behavior and evidence | Desired behavior |
| --- | --- | --- |
| #141 | Staging deployment documentation defines protected FCM secret synchronization and a Cloudflare-only encryption key. Actual resource and credential readiness is not verified. | The owner configures Firebase, APNs, protected FCM credentials, and the Cloudflare-only encryption key. Configuration and Firebase OAuth validation pass without sending a test notification. |
| #130 | Flutter has Firebase lifecycle code, but the current foreground handler deliberately suppresses an OS banner. No physical-device evidence exists. | Android and iOS display an OS banner in the foreground and a tappable OS notification when backgrounded or terminated. Taps authenticate and fetch authorized state before rendering. |
| #131 | Local and hosted implementation evidence exists in issue comments. Deployed, authenticated two-user, physical-device, and performance evidence remains incomplete. | The release gate records deployed messaging, recovery, account-switch privacy, push, latency, rollout, rollback, and operational evidence. |

## Actors

- The staging owner provisions and validates external configuration.
- Signed-in mobile users receive only authorized notifications on their currently valid, opted-in device sessions.
- Release owners use evidence to decide whether the feature is safe to release.

## Scope

- Protected staging Firebase, APNs, GitHub Environment, and Cloudflare Worker configuration.
- Configuration and OAuth-only readiness validation for #141. No provider test send belongs to #141.
- Physical Android and iOS checks for foreground, background, terminated, token rotation, logout, account replacement, denial, and tap routing.
- Deployed two-user messaging/recovery verification, latency and operational observations, additive rollout, and rollback evidence.

## Constraints and exclusions

- Do not commit, log, publish, or place credentials, tokens, project IDs, or encryption keys in issues.
- `PUSH_TOKEN_ENCRYPTION_KEY` remains Cloudflare-only and routine deployment must not overwrite it.
- Missing or malformed push configuration fails closed while foreground REST and realtime messaging remain available.
- Browser push, production deployment, and a general notification system are outside this brief.
- No claim of provider or device delivery follows from local tests.

## Required behavior and failure cases

- Foreground receipt must show an OS banner. Background and terminated receipt must show a tappable OS notification.
- A stale notification, expired session, account replacement, logout, or unauthorized target cannot disclose cached private content. It must resolve a current session and authorized REST state first.
- A failure to provision either required secret disables push safely without blocking foreground messaging.
- OAuth/configuration readiness is distinct from a real notification send and physical-device proof.

## Dependencies

```text
#141 staging configuration
  -> generic notification platform brief
  -> #130 physical-device validation
  -> #131 release evidence
```

The generic notification platform is specified separately in `../generic-mobile-notifications/brief.md`. It must exist before #130 and the corresponding #131 acceptance can complete.

## Validation

- Protected staging configuration and sanitized binding/readback evidence.
- Firebase OAuth validation, with no #141 test notification send.
- Physical Android and iOS validation for foreground, background, terminated, denied permission, token rotation, account switch, logout, and taps.
- Deployed two-user browser/mobile messaging and reconnect checks.
- Measured staging latency, outbox/reconnect observations, rollout and FCM-disable rollback evidence.

## Risk and rollback

Withhold or remove FCM configuration to disable push while keeping foreground messaging. Do not rotate the encryption key without a separately reviewed ciphertext migration and recovery plan. Abort the release if physical-device, privacy, or performance evidence is missing.

## Decisions and provenance

- User decision in this refinement session: #141 validates configuration and Firebase OAuth only. Real sends and device delivery belong to #130.
- User decision: foreground notifications require an OS banner, not only a background refresh.
- User decision: all three briefs were approved for saving.

## Unknowns

The current state of external staging resources, credentials, device availability, and external-provider configuration is not yet verified.
