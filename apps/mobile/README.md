# Dayli mobile

The Flutter client calls the Hono Worker. Construct generated API clients with an explicit environment base URL. Do not use the generated client's default localhost URL.

`lib/auth/native_session.dart` owns native Better Auth bearer sessions. It stores the signed `set-auth-token` response header in Keychain or Android KeyStore through `flutter_secure_storage`. It sends the value only in the `Authorization: Bearer` header and clears it after a confirmed logout or when Better Auth reports no current session. Do not put session tokens in URLs, application logs, shared preferences, or source files.

Android disables automatic backup for protected storage. The application supports Android API 29 and newer. The iOS keychain entry uses `unlocked_this_device` accessibility.

## Running the app

Pass the API origin at build time. Use the addresses in [environments](../../docs/dayli/environments.md) for emulators and devices:

```bash
flutter run --dart-define=DAYLI_API_BASE_URL=https://api.example.test
```

Google sign-in is offered when `DAYLI_GOOGLE_WEB_CLIENT_ID` (and, on iOS, `DAYLI_GOOGLE_IOS_CLIENT_ID`) is also passed with `--dart-define`. Without them the button explains that Google sign-in isn't set up for the build.

## Design

The app keeps the WDCC Dayli frontend's branding and lays it out for phones. That frontend was imported under the reuse approval in [product decisions](../../docs/dayli/product-decisions.md#existing-frontend-reuse), from [UOA-CS732-S1-2026/group-project-wdcc](https://github.com/UOA-CS732-S1-2026/group-project-wdcc) at commit `3f961fe`. `assets/wdcc/` holds its logo, dot grid, landing photos, post card, squiggles, and search icon. The logo's CSS-variable fills are replaced by their fallback colour, and the squiggles are exported from their React components with WDCC's stroke colours.

The branding comes from WDCC: its colour tokens, Spectral headings with Epilogue text, the dotted paper, soft card shadows, arrow buttons, and lowercase page names. The layout follows mobile conventions instead of WDCC's desktop sidebar:

- A bottom tab bar (daylies, friends, my days, messages) with a raised "new dayli" button in the middle, and a top bar with the logo and the profile button.
- Home leads with today's prompt, the time left to post, and a full-width Post button, then yesterday's daylies.
- The composer and settings open as full-screen pages with close and back buttons. The Post button stays above the keyboard.
- Touch targets are at least 48dp, and inputs use 16px text with their labels above. The rating is ten one-tap buttons instead of a number field.

Only the data layer is missing features:

- The feed is empty until the released-feed API (#19, #20).
- Friends, my days, and messages are placeholders until their APIs land.
- Accounts have no username until #68. Username sign-in asks for an email, the sign-up username is not sent, and the privacy switch is disabled.
- Posting needs a photo or video, as in WDCC. Chosen media stays on the device with the draft until the media API lands, and photos are not cropped.

## Structure

- `lib/app/`: configuration, theme (WDCC's default colour tokens, type scale, and shadows with Spectral and Epilogue), `go_router` routes with a session redirect, and the fresh-install guard.
- `lib/ui/`, `lib/shell/`, `lib/landing/`, `lib/home/`, `lib/settings/`, `lib/placeholders/`: the screens and shared components.
- `lib/auth/`: the native Better Auth session and `SessionController`. Signing out removes the user's unsent draft from the device.
- `lib/drafts/`: protected daily drafts (#17). Each user's draft is stored as JSON in Keychain or Android encrypted storage, never in shared preferences or files. It carries its Auckland day, prompt, idempotency key, and attachment references.
- `lib/compose/`: the daily composer (#18). Edits, including chosen media, are saved as the author types, and the draft is removed only after the server accepts the post. A draft from a day that has ended is shown as missed and is never backdated.
- `lib/posts/post_submitter.dart`: the submission seam. Until the create-post Dart client from #16 is wired in, `UnavailablePostSubmitter` keeps drafts safe and reports posting as unavailable.

iOS keeps Keychain entries after an app is deleted. On the first launch of a new installation, `clearProtectedStorageAfterReinstall` wipes the previous installation's session and drafts. A draft that can no longer be decrypted, for example after the platform key is invalidated, is removed and the author is told.

Run the mobile checks from this directory:

```bash
flutter test
flutter analyze
```

See [the authentication compatibility slice](../../docs/dayli/authentication-compatibility.md) for the Worker proof and staging prerequisites.
