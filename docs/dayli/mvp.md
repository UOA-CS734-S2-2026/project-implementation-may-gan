# MVP and delivery plan

## Experience and scope

A student records one day with a photo, a rating from 1 to 10, a reflective prompt response, and something they look forward to tomorrow. Friends see it after the shared Auckland midnight. Comments, likes, messaging, and streaks retain the existing social experience.

Mobile leads with capture and reminders. Web retains basic posting and messaging, but adds a calendar, longer mood history, period comparisons, and year-in-review. Those reflection tools give users a reason to open both apps.

All requested additions remain in the course scope, with the agreed platform fallbacks. The exception is the original E2EE requirement, explicitly replaced by server-readable posts/messages protected with HTTPS, encryption at rest, and access controls. There is no Matrix or user-managed encryption recovery.

These phases specify build order. Phase 1 is the first usable product, not a proposal to silently drop later work.

## Phase 0: verify integrations

- Import and run the existing web/backend tests against an isolated database. Record imported code attribution.
- Complete Better Auth login, logout, expiry, and recovery on physical iOS and Android devices. Prove the native OAuth handoff.
- Demonstrate phone-to-web messaging through REST, PostgreSQL, and an Ably invalidation. Disconnect/reconnect and fetch missing history.
- Prove a private photo upload and denied unauthorised download. Check the existing Cloudinary path before retaining any post URLs.
- Deliver a generic push to each platform through the team's app credentials.
- Test supported music metadata, screenshots, assistant entry, charging detection, and local draft protection. Record OS versions and limitations.

AI-assisted development can help build these experiments. It cannot create unavailable OS permissions or substitute for physical-device and security evidence.

## Phase 1: the daily loop

Deliver auth, protected offline drafts, camera capture, private uploads, solo/friends audiences, midnight-gated access, existing social workflows, web posting fallback, PostgreSQL messaging, and synced history.

Demo Alice posting from a phone and viewing her entry on the web. Bob must be denied before midnight through both UI and direct API requests. After release, Bob can read it while Alice's phone is offline. Send messages in both directions, disconnect a client, then restore its history through normal authenticated fetches.

Retain mood SQL and the existing weekly chart. Extend it after the core access rules and upload flow work.

## Phase 2: ritual and context

| Addition | Build | Fallback and acceptance check |
| --- | --- | --- |
| Midnight push | Schedule an opt-in generic release notification | Access unlocks even if push is denied or late. |
| Closing-window nudge | Check server posting state before dispatch | Discard expired nudges; opening a stale reminder fetches current state. Respect quiet hours. |
| Camera-first capture | Preview, switch camera, retake, compression, draft persistence | Offer attachment fallback after permission denial. |
| Weather | Coarse location with permission and a provider snapshot | Allow omission or user-selected place. Record capture time; no background location tracking. |
| Music | Supported OS/provider metadata with editable title/artist | iOS cannot read arbitrary apps' playback. Manual selection is the cross-platform fallback. |
| Ambient audio | Explicit one-second recording with visible state, playback, and removal | No silent recording. Denial leaves a valid entry. Consider bystanders. |

Automatic context means less effort after opt-in, not hidden collection. Preview fields before submission. Weather and provider-based music access are not inherently unavailable to browsers; the native advantage is the device capture workflow and supported integrations.

## Phase 3: memory and privacy

| Addition | Build | Fallback and acceptance check |
| --- | --- | --- |
| On this day | Anniversary queries over posting dates and generic reminders | Use clearly labelled seeded history for demonstrations. Define February 29 handling. |
| Future-self notes | Owner-only stored note with due instant and notification | Scheduled delivery, not a cryptographic time lock. |
| Night charging recap | Offer a calm recap when active or reopened at night while charging | Otherwise use an opt-in nightly notification. Do not force-launch a screen or promise charging wakes iOS. |
| Biometric lock | Gate local access, protect local credentials/data, relock, obscure app-switcher previews | Test passcode fallback, missing biometrics, enrolment changes, and lockout. It does not hide content from the backend. |
| Screenshot alerts | Best-effort authenticated events for a visible post | iOS reports after capture. Android 14 detects supported capture actions. Browsers, older OS versions, and external cameras have gaps. |
| Solo journal | Owner-only post audience with no friendship dependency | Public profile visibility never overrides solo access. |

Tell viewers when screenshot reporting is active. The callback does not establish exactly what was captured, so avoid definitive accusations if the visible post changes during capture.

## Phase 4: reflection, sharing, and assistants

Extend server-side mood queries into bounded date ranges, calendar summaries, year-in-review, and descriptive weather/music comparisons. Show sample sizes and missing data. Do not describe correlations as diagnoses or causes.

Share links lead to signup and then a grant to one post. Proposed default is an expiring single-use invitation. The first authenticated claimant receives access, subject to the usual midnight rule. Warn that forwarding an unused link can transfer that opportunity. Recipient-bound invitations offer stronger control. Author presence and encryption-key transfer are unnecessary.

On iOS, use a Swift App Intent/App Shortcut to open today's Flutter composer, optionally with a validated rating. On Android, test App Actions against a supported built-in intent and deep-link fulfilment. Supported phrases, locales, assistant versions, and distribution requirements vary. A launcher shortcut or deep link is the fallback, not proof of arbitrary voice support.

"Log my Dayli" opens the composer. A supported rating parameter prefills a draft, but does not bypass unlock or user confirmation. Assistant providers may process speech. Do not add dictated private journal text by default, and keep ratings out of unredacted URL logs/analytics.

## Proposed bounds

Start with one primary photo, a thumbnail, and optional one-second audio. Propose a 5 MB total media cap and a roughly 1 MB compressed-photo target, subject to device-quality tests. The current schema supports video; record video as deferred rather than silently breaking it during import.

Keep comments, likes, profiles, friendship requests, streaks, and the existing messaging acceptance experience. Avoid adding public discovery feeds, group chat, or an AI therapist. Public journal viewing becomes authenticated grants under the agreed privacy model.

## Platform references

- [Apple Music player scope](https://developer.apple.com/documentation/mediaplayer/mpmusicplayercontroller)
- [Android media session access](https://developer.android.com/reference/android/media/session/MediaSessionManager)
- [Apple screenshot notification](https://developer.apple.com/documentation/uikit/uiapplication/userdidtakescreenshotnotification)
- [Android screenshot detection](https://developer.android.com/about/versions/14/features/screenshot-detection)
- [Apple background tasks](https://developer.apple.com/documentation/backgroundtasks)
- [Android background activity restrictions](https://developer.android.com/guide/components/activities/background-starts)
- [Apple App Intents](https://developer.apple.com/documentation/appintents)
- [Android App Actions](https://developer.android.com/develop/devices/assistant/overview)
- [Open-Meteo terms](https://open-meteo.com/en/terms)

These references establish boundaries. Test the selected plugins and user journeys on the actual devices used for assessment.
