# Dayli mobile

The Flutter client calls the Hono Worker. Construct generated API clients with an explicit environment base URL. Do not use the generated client's default localhost URL.

`lib/auth/native_session.dart` owns native Better Auth bearer sessions. It stores the signed `set-auth-token` response header in Keychain or Android KeyStore through `flutter_secure_storage`. It sends the value only in the `Authorization: Bearer` header and clears it after a confirmed logout or when Better Auth reports no current session. Do not put session tokens in URLs, application logs, shared preferences, or source files.

Android disables automatic backup for protected storage. The application supports Android API 29 and newer. Debug builds use application ID `nz.ac.auckland.dayli.dayli_mobile.staging` so their staging Google OAuth registration does not collide with release builds. Release builds keep `nz.ac.auckland.dayli.dayli_mobile`; neither an Android release Google client nor release signing has been validated. The iOS keychain entry uses `unlocked_this_device` accessibility.

Current staging observation: Android Google sign-in completed with a distinct Google account. It did not complete for a Google account whose email already belonged to a password account, which is expected until that password holder explicitly connects Google in Settings. Android persistence and logout after Google sign-in have not been checked, and iOS has not been tested.

## Running the app

Pass the API origin at build time. Use the addresses in [environments](../../docs/dayli/environments.md) for emulators and devices:

```bash
flutter run --dart-define=DAYLI_API_BASE_URL=https://api.example.test
```

For the local HTTPS API on an Android emulator or USB device, Dart's `HttpClient` ignores CAs installed on the device, so pass the mkcert root to a debug build. The app trusts it only when `kDebugMode` is true. Run `adb reverse tcp:8787 tcp:8787` first, as described in [Android debug builds](../../docs/dayli/environments.md#android-debug-builds):

```bash
flutter run --debug \
  --dart-define=DAYLI_API_BASE_URL=https://localhost:8787 \
  --dart-define=DAYLI_DEV_CA_PEM_B64="$(base64 < "$(mkcert -CAROOT)/rootCA.pem" | tr -d '\n')"
```

Google sign-in is offered when `DAYLI_GOOGLE_WEB_CLIENT_ID` is passed with `--dart-define`. Register the debug build's `.staging` application ID and its current debug SHA-1 in the staging Google project. Get the fingerprint with `./gradlew signingReport` from `apps/mobile/android`; keep it out of chat and Git. On iOS, also pass `DAYLI_GOOGLE_IOS_CLIENT_ID` and configure the callback scheme before running:

```bash
cp ios/Flutter/GoogleSignIn.xcconfig.example ios/Flutter/GoogleSignIn.xcconfig
```

Set `GOOGLE_REVERSED_CLIENT_ID` in the copied file to the `REVERSED_CLIENT_ID` from the iOS client's `GoogleService-Info.plist`. The local file is ignored by Git. Do not put a real value in the example or a tracked Xcode configuration. The reversed client ID is a public identifier, not an OAuth client secret.

`--dart-define` configures Dart only. Flutter writes those defines to `Generated.xcconfig` as encoded `DART_DEFINES`, so an Info.plist substitution cannot read them. `Runner/Info.plist` reads `GOOGLE_REVERSED_CLIENT_ID` from the local Xcode configuration and registers it in `CFBundleURLTypes`. Use both settings for an iOS Google build:

```bash
flutter run \
  --dart-define=DAYLI_API_BASE_URL=https://api.example.test \
  --dart-define=DAYLI_GOOGLE_WEB_CLIENT_ID=replace-with-web-client-id \
  --dart-define=DAYLI_GOOGLE_IOS_CLIENT_ID=replace-with-ios-client-id
```

Without the Dart IDs the button explains that Google sign-in isn't set up for the build. Without the Xcode setting, iOS cannot return from Google sign-in.

## Connecting Google to a password account

Dayli never connects identities merely because their emails match. After signing in with email and password, open **Settings**, choose **Connect Google**, enter the current Dayli password, and choose the Google account with the same verified email. The Worker verifies the password against the authenticated bearer session in the link request, then verifies the Google token. The app does not accept a client-only confirmation and does not replace the stored bearer token during linking.

If the link is rejected, check that the Google email exactly matches the Dayli email and that it is not already connected to another Dayli account. If the password is unavailable, complete password recovery first, then sign in and try again. Do not create a duplicate account to bypass the mismatch. This flow has local unit coverage but still needs the explicit Android persistence/logout and iOS staging checks above.

## Design

The app keeps the WDCC Dayli frontend's branding and lays it out for phones. That frontend was imported under the reuse approval in [product decisions](../../docs/dayli/product-decisions.md#existing-frontend-reuse), from [UOA-CS732-S1-2026/group-project-wdcc](https://github.com/UOA-CS732-S1-2026/group-project-wdcc) at commit `3f961fe`. `assets/wdcc/` holds its logo, dot grid, squiggles, and search icon. The logo's CSS-variable fills are replaced by their fallback colour, and the squiggles are exported from their React components with WDCC's stroke colours.

The branding comes from WDCC: its colour tokens, Spectral headings with Epilogue text, the dotted paper, soft card shadows, arrow buttons, and lowercase page names. The layout follows mobile conventions instead of WDCC's desktop sidebar:

- A bottom tab bar (daylies, friends, my days, messages) with a raised "new dayli" button in the middle, and a top bar with the logo and the profile button.
- Home leads with today's prompt, the time left to post, and a full-width Post button, then friends' released daylies, newest day first. Pull down to refresh; more load on demand.
- The composer and settings open as full-screen pages with close and back buttons. The Post button stays above the keyboard.
- Touch targets are at least 48dp, and inputs use 16px text with their labels above. The rating is a 1–10 slider that starts unset, so a rating is always chosen on purpose.

Only the data layer is missing features:

- Feed cards show the first photo, or a still tile for a video. The post screen shows every photo and plays a video muted and looping (#24). Likes and comments arrive with #79/#80.
- Friends, my days, and messages are placeholders until their APIs land.
- Accounts have no username until #68. Email is the only supported account identifier, and the privacy switch is disabled.
- Media is optional, unlike WDCC, so a denied photo permission never blocks a text-only post. Chosen media is compressed and uploaded in the background (#22), and the post links the validated uploads. Feed cards and post detail can't show it until downloads are authorised (#24). Photos are not cropped.

## Structure

- `lib/app/`: configuration, the debug-only development CA check, theme (WDCC's default colour tokens, type scale, and shadows with Spectral and Epilogue), `go_router` routes with a session redirect, and the fresh-install guard.
- `lib/ui/`, `lib/shell/`, `lib/landing/`, `lib/home/`, `lib/settings/`, `lib/placeholders/`: the screens and shared components.
- `lib/auth/`: the native Better Auth session and `SessionController`. Signing out removes the user's unsent draft from the device.
- `lib/drafts/`: protected daily drafts (#17). Each user's draft is stored as JSON in Keychain or Android encrypted storage, never in shared preferences or files. It carries its Auckland day, prompt, idempotency key, and attachment references.
- `lib/compose/`: the daily composer (#18). It has the prompt, optional media, a rating, the answer, the word dump, an optional note to tomorrow, and a solo or friends choice with no default. Edits are saved as the author types, and the draft is removed only after the server accepts the post. A draft from a day that has ended is shown as missed and is never backdated. If today already has a post, unposted words stay readable until the author discards them. See [daily post creation](../../docs/dayli/daily-posts.md) for how each server response is handled.
- `lib/compose/media_compressor.dart`, `media_upload_controller.dart`, and `lib/api/media_upload_client.dart`: compress, reserve, upload, and complete each attachment (#22). See [the Flutter client flow](../../docs/dayli/media-reservations.md#flutter-client).
- `lib/posts/post_submitter.dart`: `GeneratedPostSubmitter` sends the draft through the generated Dart client with its stored idempotency key and the bearer session. It maps each `409` reason, `401`, `422`, outages, and lost connections to results the composer handles.

iOS keeps Keychain entries after an app is deleted. On the first launch of a new installation, `clearProtectedStorageAfterReinstall` wipes the previous installation's session and drafts. A draft that can no longer be decrypted, for example after the platform key is invalidated, is removed and the author is told.

Run the mobile checks from this directory:

```bash
flutter test
flutter analyze
```

See [the authentication compatibility slice](../../docs/dayli/authentication-compatibility.md) for the Worker proof and staging prerequisites.
