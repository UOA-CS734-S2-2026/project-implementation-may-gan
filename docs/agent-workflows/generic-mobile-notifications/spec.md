# Specification: Generic mobile notification platform and initial publishers

**Status:** Approved 2026-10-03.  
**Brief:** [brief.md](brief.md)

**Approval:** User approved this specification and its account-level opt-in, preview, capability-gating, and expiry amendments during the AGaw planning session on 2026-10-03.

## Problem

Mobile push currently represents only a messaging conversation change. Its foreground handler refreshes the inbox without an OS banner, and no safe shared publisher exists for friend requests or time-sensitive daily-post events. This affects opted-in mobile users who can miss events, and it would force future features to recreate delivery, authorization, and tap-safety logic. Existing code confirms messaging-specific FCM payloads and conversation-only routing. Real Firebase/APNs and device behavior remain not yet verified.

## Success

Trusted backend features can publish one of four approved, typed event categories through an internal notification capability. Capable, opted-in users receive OS notifications on Android and iOS, including when the app is foregrounded. Direct-message previews show the sender display name and current message text. Friend-request previews show the sender display name only. A tap waits for valid authentication and an authorized fetch before navigation.

## Actors and permission boundary

- Only trusted server feature modules can publish an approved event. There is no public arbitrary-send API.
- A recipient must have an opted-in, current mobile device registration and active account/session.
- The source event retains its own authorization rules. The notification layer never grants access.
- The mobile app treats all notification data and targets as untrusted until it has a current signed-in session and fetches the destination's authorized state.

## User-visible behavior

### Event categories

| Event | Recipient and timing | Banner content | Tap destination |
| --- | --- | --- | --- |
| New direct message | Peer device registrations after a new message, including an initial request | Sender display name and current message text | Named conversation |
| Friend request | Recipient only, after a newly pending request | Sender display name and fixed friend-request wording only | `/friends`, which shows incoming requests |
| Final-hour reminder | 23:00 Pacific/Auckland, only if the opted-in user has not posted for that Auckland day | Fixed product wording | `/post` |
| Friends-post release | 00:00 Pacific/Auckland, only if an opted-in user has at least one newly released, currently authorized friends-audience post | Fixed product wording, no friend/post identity | `/` friends feed |

Fixed daily-event copy is a product-copy implementation detail and must not contain friend identities or post content. Message and friend-request previews follow the distinct name/text rules above.

### Global opt-in

One account-level mobile-notification preference applies to every category and to both legacy and new delivery paths, and defaults off for new and existing users. A device is eligible only when that preference is enabled and the device separately has OS permission, a valid registered token, and support for the notification schema. There are no per-category controls in this release. Permission denial leaves the app functional, causes no registration, and does not repeatedly prompt.

### Foreground, background, and taps

- A foreground FCM event displays a local OS banner through a generic Flutter presentation service and performs the appropriate safe refresh. Only one platform presentation mechanism may show that banner.
- A background or terminated event displays a platform OS notification. The user can tap it.
- A tap waits for the session to be signed in, fetches current authorized state, then navigates to the destination.
- A deleted, cancelled, expired, blocked, unauthorized, or otherwise stale target displays no private cached content and falls back to its relevant root route.

## Delivery and authorization scenarios

1. **Message notification:** A newly persisted message produces at most one durable event per eligible capable device delivery attempt. Edits, reactions, reads, and realtime events do not. At dispatch, the system reads the current authorized message: an edit updates the preview; an unsent message suppresses a queued alert. A banner already delivered cannot be recalled.
2. **Friend request:** A newly pending request can notify only its recipient. At dispatch, the request must still be pending and no block may exist in either direction. Cancellation, resolution, or block suppresses it.
3. **Daily reminder:** At 23:00 Pacific/Auckland, users with an accepted post for that day are excluded. Scheduler retries cannot create duplicate recipient events.
4. **Daily release:** At 00:00 Pacific/Auckland, eligibility is determined from newly released friends-audience posts and current friendship/block rules. No alert is sent if no currently authorized post exists.
5. **Account/session change:** Logout, revocation, account replacement, invalidated tokens, or disabled opt-in suppress delivery and cannot open old-account content.
6. **Provider behavior:** Permanent token rejection invalidates the device registration. Transient failures retry with bounded backoff. Provider failure never rolls back the source message, request, or post state.
7. **Scheduler recovery:** Repeated cron runs, process restarts, and daylight-saving boundaries do not duplicate a logical daily notification. Recovery may delay it.

## Nonfunctional requirements

- Server scheduling is based on `Pacific/Auckland`, not the device clock, and correctly handles daylight-saving transitions. A delayed reminder expires at Auckland midnight; a delayed release notice expires at the end of that Auckland day.
- Durable deduplication survives Worker restarts and concurrent scheduler invocations.
- Dispatch uses bounded, fenced leases and does not log tokens, message text, sender identity, or opaque target identifiers beyond existing safe operational identifiers.
- The system is at-least-once to FCM and cannot promise exactly-one OS banner.
- Existing messaging realtime delivery remains independent from notification-provider failure.

## Compatibility and rollout

The API server can deploy the general notification capability and schema before publishers are enabled. Existing devices retain legacy message-only delivery until they register support for the new payload schema. A capable device receives generic-platform message delivery instead of legacy message delivery, never both. FCM configuration remains optional and fails closed. Android/iOS physical-device validation is gated by #141 configuration and #130. Browser push is unaffected because it is excluded.

## Out of scope

Browser push, a public arbitrary-send API, arbitrary event types, per-category preferences, notification history/inbox, arbitrary custom copy, a general broadcast system, new non-mobile transport channels, and quiet-hours suppression. The user approved reusing #34 for final-hour reminders and splitting its undefined quiet-hours requirement into a blocked follow-up. Daily alerts can arrive at midnight until that follow-up ships.

## Resolved decisions

The brief and subsequent refinement establish the four initial categories, account-level global opt-in defaulting off, foreground OS banners, authenticated routing, Pacific/Auckland timing, persistent deduplication, capability-gated rollout, and an internal typed publisher allowlist. Message previews show sender display name and current text. Friend-request previews show sender display name and fixed request wording.

## Ticket-planning clarifications

The user explicitly approved applying account consent to legacy and new delivery alike, reusing #34 for reminders, and splitting quiet hours into a non-blocking follow-up. Existing legacy devices still need account consent before delivery. Notification code and mock testing do not require credentials; live staging and device gates do.

## Unresolved questions

None affecting user-visible behavior. Exact copy, class/module names, table names, and local-notification package configuration are implementation choices subject to the plan below.
