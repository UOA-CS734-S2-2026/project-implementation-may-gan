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

The app uses the WDCC Dayli frontend's design at phone width. That frontend was imported under the reuse approval in [product decisions](../../docs/dayli/product-decisions.md#existing-frontend-reuse), from [UOA-CS732-S1-2026/group-project-wdcc](https://github.com/UOA-CS732-S1-2026/group-project-wdcc) at commit `3f961fe`. `assets/wdcc/` holds its logo, dot grid, landing photos, squiggles, and search icon. The logo's CSS-variable fills are replaced by their fallback colour, and the squiggles are exported from their React components with WDCC's stroke colours. `lib/ui/` reimplements its Button, FormInput, card, LiveClock, and Google button, and `lib/shell/` its floating menu and full-screen navigation.

Only the data layer differs from WDCC:

- The feed is empty until the released-feed API (#19, #20).
- Friends, my days, and messages are placeholders until their APIs land. User search finds no one until the profile API (#68).
- Accounts have no username until #68. The menu shows the email, username sign-in asks for an email, and the sign-up username is not sent. Settings shows the username as "not set yet" and the privacy switch is disabled.
- The composer follows WDCC's media-first flow. Chosen photos and videos stay on the device with the draft and are not uploaded until the media API lands. Photos are not cropped; previews are cropped square as WDCC's are. A tap removes media where WDCC drags it to a bin.
- The profile block in the menu opens settings, so sign-out is reachable.

## Structure

- `lib/app/`: configuration, theme (WDCC's default colour tokens, type scale, and shadows with Spectral and Epilogue), `go_router` routes with a session redirect, and the fresh-install guard.
- `lib/ui/`, `lib/shell/`, `lib/landing/`, `lib/home/`, `lib/settings/`, `lib/placeholders/`: the WDCC pages and components.
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
