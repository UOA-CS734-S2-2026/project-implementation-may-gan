# MVP and delivery plan

## Experience and scope

Students share one daily photo, a rating from 1 to 10, a reflective answer, and something they look forward to tomorrow. Friends see entries after Auckland midnight. Keep comments, likes, profiles, friendship requests, streaks, and messaging acceptance.

Mobile leads with capture and reminders. Web retains posting/chat and adds calendar, mood history, period comparisons, and year-in-review. Both use the Hono API. All agreed additions remain in scope with the fallbacks below. E2EE was explicitly replaced by the server-readable [privacy model](security.md).

These phases specify build order, not permission to silently drop later work.

## Phase 0: prove integrations

Run imported tests against isolated data. Prove Worker-compatible auth and Drizzle/Hyperdrive transactions, native login/recovery, private uploads, and FCM on both platforms. Demonstrate phone-to-web chat through PostgreSQL and Durable Objects, including hibernation and reconnect catch-up. Test Next.js hosting compatibility separately.

Record exact OS versions and physical-device results for music, screenshots, assistants, charging, and local data protection before promising their behaviour.

## Phase 1: daily loop

Deliver protected offline drafts, camera capture, private uploads, solo/friends audiences, midnight access, existing social workflows, web posting fallback, and messaging with synced history. Retain SQL mood queries and the weekly chart.

Demo a phone submission, owner access on web, and a friend's denied direct API request before midnight. After release, the friend can read while the author's phone is offline. Disconnect/reconnect chat and recover missing history without duplicates.

## Phase 2: ritual and context

| Feature | Build and fallback |
| --- | --- |
| Feed-unlock push | Opt-in generic notification. Access unlocks even if push is denied or late. |
| Closing-window nudge | Check server posting state, respect quiet hours, discard obsolete reminders. |
| Camera-first capture | Preview, switch, retake, compress, save draft. Attachment fallback after denial. |
| Weather | Permission-based coarse location and provider snapshot. Allow omission/manual place; no background tracking. |
| Music | Supported OS/provider metadata with editable title/artist. Manual selection when unavailable; iOS cannot read arbitrary apps' playback. |
| Ambient sound | Explicit one-second recording with visible state, preview, and removal. Never silent capture; denial leaves posting usable. |

Preview context before submission. Automatic means less effort after opt-in, not hidden collection. Weather/provider music access is not inherently unavailable to browsers; native capture and supported device integrations are the advantage.

## Phase 3: memory and privacy

| Feature | Build and fallback |
| --- | --- |
| On this day | Anniversary queries and generic reminders. Use labelled historical seeds for the demo; define February 29 handling. |
| Future-self notes | Owner-only note and due-time notification, not a cryptographic time lock. |
| Night charging recap | Offer when active/reopened at night while charging. Otherwise an opt-in nightly notification; no forced launch or guarantee charging wakes iOS. |
| Biometric lock | Protected local access, relock, hidden app-switcher previews. Test passcode fallback, lockout, and enrolment changes. |
| Screenshot alerts | Best-effort reports with a viewer notice. iOS reports after capture; Android 14 covers supported actions. Browsers, older OS versions, and external cameras have gaps. |
| Solo journal | Owner-only audience, independent of friendships. Public profile discovery never overrides it. |

Screenshot callbacks cannot prove exactly what was captured. Avoid definitive accusations or anti-leak claims. Biometric lock does not hide content from Dayli's backend.

## Phase 4: reflection, sharing, assistants

Build bounded server-side history/recap queries and web calendar/year-in-review views. Weather/music comparisons show sample sizes and missing data, not medical diagnoses or causal claims.

Sharing requires signup and grants one post after release. Proposed default is an expiring single-use invitation. Disclose forwarding risk; recipient-bound invitations offer stronger control. It creates no friendship or wider archive access.

Use Swift App Intents/App Shortcuts on iOS and test supported Android App Actions with deep-link fulfilment. "Log my Dayli" opens today's composer; a supported rating parameter prefills it but never bypasses unlock or submission confirmation. Assistant/locale/distribution constraints may require launcher-shortcut fallback. That fallback is not proof of arbitrary spoken-phrase support. Keep private dictation out of scope and ratings out of URL logs.

## Proposed media bounds

Start with one primary photo, a thumbnail, and optional one-second audio. Target roughly 1 MB per primary photo and cap total media at 5 MB, subject to device-quality tests. Existing video support is explicitly deferred, not silently removed during import. Do not add public discovery, group chat, or an AI therapist.

## Platform references

- [Apple Music scope](https://developer.apple.com/documentation/mediaplayer/mpmusicplayercontroller) and [Android media sessions](https://developer.android.com/reference/android/media/session/MediaSessionManager)
- [Apple screenshots](https://developer.apple.com/documentation/uikit/uiapplication/userdidtakescreenshotnotification) and [Android screenshot detection](https://developer.android.com/about/versions/14/features/screenshot-detection)
- [Apple background tasks](https://developer.apple.com/documentation/backgroundtasks) and [Android background launches](https://developer.android.com/guide/components/activities/background-starts)
- [Apple App Intents](https://developer.apple.com/documentation/appintents) and [Android App Actions](https://developer.android.com/develop/devices/assistant/overview)
- [Open-Meteo terms](https://open-meteo.com/en/terms)
