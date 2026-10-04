# MVP and build order

Keep the daily photo, rating, reflective answer, tomorrow note, friends feed, comments, likes, profiles, streaks, and messaging. All agreed additions remain in scope with supported fallbacks. These phases describe order, not dropped requirements.

## 1. Prove the foundations

Test Hono/Workers with Better Auth, Drizzle/Hyperdrive transactions, private R2 uploads, FCM, and physical iOS/Android login. Prove phone-to-web chat, socket hibernation, and reconnect catch-up. Check Next.js hosting compatibility separately.

Then deliver the daily loop: protected offline drafts, camera, posting fallback on web, solo/friends audiences, midnight permissions, and synced messaging. Demo direct API denial before midnight and access afterward while the author is offline.

## 2. Mobile ritual and context

| Feature | Scope and fallback |
| --- | --- |
| Unlock push and closing nudge | Opt-in generic reminders, quiet hours, stale-nudge rejection. Feed access never depends on push arrival. |
| Camera-first capture | Preview, retake, compress, save draft; attachment fallback after denial. The Flutter composer takes a photo or records a video of up to 15 seconds with the device camera, using the system camera screen for preview and retake, or picks from the library; either goes through the same compress, upload and draft steps. |
| Weather | Permission-based coarse location/provider snapshot; omit or select place manually. |
| Music | Supported OS/provider title and artist; manual selection when unavailable. No universal cross-app access. |
| Ambient sound | Explicit one-second recording with preview/removal. Never silent capture. |
| Voice memo | One optional explicit in-app recording of up to 60 seconds with preview/removal, recorded on mobile only; every device can play it. Never silent capture. Separate from ambient sound (#63). |

## 3. Memories and privacy

| Feature | Scope and fallback |
| --- | --- |
| On this day | Anniversary reminders; labelled historical seeds for demos and defined leap-day handling. |
| Future-self notes | Owner-only notes delivered on chosen dates, not cryptographic time locks. |
| Night charging recap | Show while active/reopened and charging; otherwise opt-in nightly notification. No forced launch. |
| Biometric lock | Protected local access, relock, obscured app-switcher preview; test passcode and enrolment changes. |
| Screenshot alerts | Best-effort supported OS callbacks with viewer notice. Not proof of capture or leak prevention. |
| Solo journal | Owner-only posts independent of friendship or public profile visibility. |

## 4. Web reflection, sharing, assistants

Add calendar, mood history, comparisons, and year-in-review backed by bounded SQL. Show missing data/sample sizes; avoid diagnostic claims.

Anyone can discover an account by username. A public account exposes its profile details and released `friends` posts without requiring sign-in. A private account exposes only its username and a generic private-profile state to non-friends. `solo`, unreleased, deleted, trashed, and blocked content remains protected. Public media is delivered only through an authorized Worker route that rechecks the parent resource on every request.

Siri/App Intents and supported Android App Actions open today's composer, optionally prefilling a validated rating. Require unlock and submission confirmation. Use launcher/deep-link fallback where voice support is unavailable; do not claim identical phrases work everywhere.

Start with up to three photos or one video, not mixed. Limit each attachment to 10 MB, each post to 25 MB total, and each video to 15 seconds after client compression. Support iOS 16 and newer and Android 10/API 29 and newer. Permission denial must not block text-only posting.

[Apple native APIs](https://developer.apple.com/documentation/) · [Android screenshot limits](https://developer.android.com/about/versions/14/features/screenshot-detection) · [Android App Actions](https://developer.android.com/develop/devices/assistant/overview)
