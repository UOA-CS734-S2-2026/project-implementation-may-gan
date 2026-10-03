# Brief: Generic mobile notification platform and initial publishers

**Status:** Approved 2026-10-03. This is a brief, not an implementation authorization.

## Sources

- User-approved decisions from this refinement session.
- Existing overlap: [#130](https://github.com/UOA-CS734-S2-2026/project-implementation-may-gan/issues/130), for Flutter/device integration only.
- Related delivery gate: [#141](https://github.com/UOA-CS734-S2-2026/project-implementation-may-gan/issues/141).
- Related release gate: [#131](https://github.com/UOA-CS734-S2-2026/project-implementation-may-gan/issues/131).
- Background only, not an approved spec: `docs/implementation/messaging-implementation-handoff.md`.

## Shared problem and impact

Current push delivery is messaging-specific, suppresses foreground OS banners, and provides no safe reusable backend interface for friend-request or daily-post notifications. Users can miss time-sensitive product events, while future features would otherwise duplicate delivery, privacy, session, and tap-routing logic.

## Intended outcome

Provide an internal-only, typed notification platform that approved backend features can use to deliver generic mobile OS notifications. The platform must preserve authorization and privacy, support foreground banners, and route taps only after current authentication and authorized data fetches.

## Initial event publishers

1. **New direct message**, including an initial message request. Do not notify for edits, reactions, reads, or socket events.
2. **New friend request**, only to the recipient.
3. **Final-hour daily-post reminder**, at 23:00 Pacific/Auckland, only to opted-in users who have not submitted an accepted post for that Auckland day.
4. **Friends-post release**, at 00:00 Pacific/Auckland, only to opted-in users with at least one newly released, currently authorized friends-audience post from an active, unblocked friend.

## Current and desired behavior

| Area | Current fact | Desired behavior |
| --- | --- | --- |
| Server delivery | The existing outbox and FCM adapter are built for messaging push. No generic event publisher or daily scheduler exists. | A shared internal typed interface accepts only approved event types. Each publisher selects recipients and creates durable delivery work. |
| Mobile foreground | `FirebasePushLifecycle` receives foreground messages but intentionally does not show an OS banner. | A feature-neutral Flutter notification presentation service shows an OS banner while the app is open. |
| Taps | Conversation routing exists for messaging notifications. | Typed, opaque targets route messages to a conversation, friend requests to pending requests, reminders to today's composer, and releases to the friends feed. |
| Scheduling | The Worker has retry scheduling, but no daily notification scheduler. | A server-side scheduler evaluates the Pacific/Auckland calendar at 23:00 and 00:00, including daylight-saving changes, and persists per-user event identity for deduplication. |

## Actors

- Trusted backend feature modules publish approved notification events.
- Opted-in, signed-in users receive notifications only on valid registered mobile sessions.
- The Flutter app presents the notification and resolves taps safely.

## Scope

- Internal server notification contract with a typed allowlist.
- Shared durable delivery and dispatch capability suitable for approved events.
- Flutter notification presentation abstraction, including foreground OS banners.
- FCM delivery, Android/iOS behavior, notification tap routing, and session-aware stale-target handling.
- Initial publishers and their event-specific authorization checks.
- Pacific/Auckland daily scheduling and persistent deduplication.
- An account-level global mobile-notification preference, defaulting off, plus device-level OS permission, valid-registration, and notification-schema eligibility.

## Privacy and authorization rules

- There is no public endpoint or client command that can arbitrarily notify a user.
- **Amended during specification planning, user-approved:** direct-message banners show sender display name and current message text. A queued alert uses edited text and is suppressed if the message is unsent before dispatch. Friend-request banners show sender display name and fixed request wording only.
- Daily notices use fixed product wording only and do not disclose a friend's identity or post content.
- Notification payloads carry an approved event type and opaque validated target only.
- A tap is untrusted input. The app waits for a valid session, fetches authorized state, then renders. Missing or unauthorized targets fall back to the relevant root screen without private disclosure.
- Friend-request dispatch rechecks that the request is pending and that neither direction is blocked.
- Every delivery rechecks account-level preference, device eligibility, current session, account status, notification-schema capability, and event-specific authorization.

## Scheduling and delivery guarantees

- The server uses the `Pacific/Auckland` calendar, not device-local time.
- A scheduler may run at least once per minute. Persistent per-user event IDs prevent duplicate events across retries, restarts, and daylight-saving transitions.
- Recovery can delay a notification. Reminders expire at the following Auckland midnight and release notices expire at the end of their Auckland day. The system does not promise exact-to-the-second delivery or exactly-once OS banners.

## Exclusions

- Browser push.
- Per-category preferences, notification inbox/history, arbitrary custom notification copy, and a general broadcast system.
- Quiet-hours suppression, explicitly deferred during ticket planning. #34 is reused for final-hour reminders; its quiet-hours requirement is preserved in a blocked follow-up.
- Arbitrary external publishers or a public arbitrary-send API.
- New server-originated event categories beyond the four named publishers.

## Examples and failure cases

- A foreground message creates an OS banner, then a tap opens the authorized conversation.
- A background friend request cancelled before dispatch produces no notification.
- A user who has already posted does not receive the 23:00 reminder.
- A user with no currently authorized friends posts does not receive the midnight release notification.
- An old-account notification after device account replacement cannot open the old account's content.
- Scheduler replay or provider retry cannot create duplicate durable notification events for the same recipient/category/Auckland day.

## Dependencies

```text
#141 staging Firebase/APNs and secret setup
  -> generic notification platform
  -> #130 physical-device validation
  -> #131 deployed release evidence
```

## Validation

- Unit and integration tests for typed publishers, authorization rechecks, durable deduplication, timezone/DST boundaries, scheduling recovery, and token/session invalidation.
- Flutter tests for foreground banners, background/terminated handling, global opt-in, account changes, and all four tap destinations.
- Physical Android and iOS evidence after #141 configuration.

## Risk and rollback

Disable FCM configuration or the notification feature flag while retaining messaging and daily-post functionality. Do not allow provider failures to block source transactions. Preserve durable event data and use additive migrations only.

## Decisions and provenance

- User decision: provide a reusable generic server notification interface.
- User decision: initial events are direct messages, friend requests, daily release, and a final-hour daily timer reminder.
- User decision: foreground notifications must show an OS banner.
- User decision: use one global opt-in, not category preferences.
- User amendment: implement that opt-in as an account-level preference defaulting off, plus per-device OS/token/schema eligibility.
- User amendment: capability-gate generic delivery and retain legacy message delivery for old app versions. During ticket planning the user confirmed that account-level opt-in gates both delivery paths; legacy registrations cannot bypass default-off consent.
- User amendment: direct-message previews show sender name and message text, use current edited text, and suppress after unsend. Friend-request previews show sender display name and fixed request wording.
- User amendment: a late reminder expires at midnight and a late release notice expires at the end of its Auckland day.
- User decision: use authenticated destinations and stale-target fallback.
- User decision: schedule from the Pacific/Auckland calendar at 23:00 and 00:00 with persistent deduplication.
- User decision: use an internal-only typed publisher allowlist, not an arbitrary send API.

## Unknowns

External Firebase/APNs readiness and real-device availability remain unverified.
