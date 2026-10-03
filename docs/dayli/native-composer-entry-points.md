# Native composer entry points

Siri, the Shortcuts app, and an Android launcher shortcut open today's composer in the Flutter app (#37). They only open it. Nothing is posted until the author chooses who can see the dayli (there is no default audience) and taps Post.

## The composer link

Every entry point opens one custom-scheme link:

```text
dayli://app/post
dayli://app/post?rating=7
```

The scheme is `dayli`, after the app. The host `app` is a fixed placeholder; the router reads only the path. Flutter passes the link to `go_router`, which matches `/post`, the same route as the in-app "new dayli" button. iOS registers the scheme in `ios/Runner/Info.plist` (`CFBundleURLName` is the bundle ID plus `.composer`). Android registers it with a `VIEW` intent filter on `MainActivity` for `dayli://app`.

`rating` is the only parameter read. It must be a whole number from 1 to 10, the range in the post contract (`DAILY_POST_LIMITS` in `create-post.contract.ts`) and the composer's `DailyPostLimits`. Anything else, such as `0`, `11`, `seven`, or `7.5`, is dropped and the composer opens with no rating, without a notice. Other parameters are ignored, so a link can't choose an audience, fill in words, or post. A valid rating moves the slider as if the author had set it, replacing a rating already in today's draft. A posted or missed day is shown as usual and the rating is not applied.

A `dayli://` link to any other path opens home. Put nothing private in a link: the rating is the only value it carries. The app doesn't log it, and `go_router`'s own diagnostics stay off.

## Sign-in and username setup

A link goes through the router's normal session redirect, so it can't skip sign-in, username setup, or the registration terms that sign-up requires. When the app isn't signed in yet, still restoring its session, or waiting for username setup, `PendingDestination` (`lib/app/pending_destination.dart`) remembers the composer location in memory. After sign-in, and username setup if needed, the router opens the composer with the rating instead of home. The location is never stored, logged, or kept across launches; a link opened while signed out is forgotten if the app is closed first.

## iOS: Siri and Shortcuts

`ios/Runner/ComposerIntents.swift` defines `OpenTodaysComposerIntent`, an App Intent with an optional `Rating` parameter (1–10), and `DayliShortcuts`, an `AppShortcutsProvider` with these phrases:

- "Open today's dayli in Dayli Mobile"
- "Write today's dayli in Dayli Mobile"

Siri says the app's display name, currently "Dayli Mobile". The rating can't be spoken in the phrase; set it in the Shortcuts app. The intent sets `authenticationPolicy` to `.requiresLocalDeviceAuthentication`, so the device must be unlocked before it runs. It opens the app (`openAppWhenRun`) and opens the composer link, so Flutter checks the rating again and applies the same sign-in rules. `openAppWhenRun` is deprecated from iOS 26 in favour of `supportedModes`, which needs iOS 26; the app supports iOS 16.

## Android: launcher shortcut

Long-press the app icon and choose **New dayli**. This is a static shortcut in `android/app/src/main/res/xml/shortcuts.xml`, linked from `MainActivity` with `android.app.shortcuts` metadata. Its intent opens `dayli://app/post` in `MainActivity`, so it uses the same Flutter route. It opens the composer without a rating. Debug builds use `src/debug/res/xml/shortcuts.xml` because their application ID ends in `.staging`; keep the two files in step.

Static XML needs no plugin or Kotlin. A plugin such as `quick_actions` would add a dependency, a Dart callback path separate from the router, and iOS home-screen quick actions this ticket doesn't ask for. Google Assistant App Actions and voice are not supported on Android. The launcher can't be reached without unlocking the device.

## Manual device checks

None of these have been run on a device yet. Use a build signed in with a username, unless a step says otherwise.

iOS 16 or newer (physical device for the lock checks):

1. Install the app, then say "Hey Siri, open today's dayli in Dayli Mobile". The composer opens with no rating.
2. In the Shortcuts app, find Dayli Mobile's **Open today's dayli** action, set Rating to 7, and run it. The composer opens with 7/10 and no audience chosen.
3. Lock the device and run the Siri phrase. The device asks to be unlocked before the app opens; cancelling leaves the app closed.
4. Sign out, run the shortcut with a rating, sign in. The composer opens with that rating. Repeat with an account that still needs a username: setup comes first, then the composer.
5. In Safari, open `dayli://app/post?rating=4`, then `dayli://app/post?rating=42`. The first opens 4/10, the second opens the composer unrated.
6. Confirm nothing is posted in any step until Post is tapped after choosing an audience.

Android 10 or newer:

1. Long-press the Dayli icon and choose **New dayli**. The composer opens with no rating.
2. Drag the shortcut to the home screen and open it from there.
3. Run `adb shell am start -a android.intent.action.VIEW -d "dayli://app/post?rating=7"`. The composer opens with 7/10. Try `rating=11` and `rating=seven`: the composer opens unrated.
4. Repeat steps 1 and 3 while signed out, and with an account that needs a username, as in iOS step 4.

## Tests

`test/composer_link_test.dart` covers rating parsing, the composer location (valid, out of range, non-numeric, missing, and extra parameters), and `PendingDestination`. `test/composer_entry_points_test.dart` delivers links the way the Flutter engine does and covers a signed-in link with each kind of rating, a link that launched the app, a link that isn't the composer, a link that can't reach the composer while signed out or during username setup, and opening the remembered composer after sign-in and username setup. Each checks that nothing is submitted. The native Swift and Android files have no automated tests.
