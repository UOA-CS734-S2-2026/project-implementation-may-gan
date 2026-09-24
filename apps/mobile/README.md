# Dayli mobile

The Flutter client calls the Hono Worker. Construct generated API clients with an explicit environment base URL. Do not use the generated client's default localhost URL.

`lib/auth/native_session.dart` owns native Better Auth bearer sessions. It stores the signed `set-auth-token` response header in Keychain or Android KeyStore through `flutter_secure_storage`. It sends the value only in the `Authorization: Bearer` header and clears it after a confirmed logout or when Better Auth reports no current session. Do not put session tokens in URLs, application logs, shared preferences, or source files.

Android disables automatic backup for protected storage. The application supports Android API 29 and newer. The iOS keychain entry uses `unlocked_this_device` accessibility.

## Running the app

Pass the API origin at build time. Use the addresses in [environments](../../docs/dayli/environments.md) for emulators and devices:

```bash
flutter run --dart-define=DAYLI_API_BASE_URL=https://api.example.test
```

## Structure

- `lib/app/`: configuration, theme (the web app's default colour tokens, Spectral and Epilogue fonts), `go_router` routes with a session redirect, and the fresh-install guard.
- `lib/auth/`: the native Better Auth session and `SessionController`. Signing out removes the user's unsent draft from the device.
- `lib/drafts/`: protected daily drafts (#17). Each user's draft is stored as JSON in Keychain or Android encrypted storage, never in shared preferences or files. It carries its Auckland day, prompt, idempotency key, and attachment references.
- `lib/compose/`: the daily composer (#18). Edits are saved as the author types, and the draft is removed only after the server accepts the post. A draft from a day that has ended is shown as missed and is never backdated.
- `lib/posts/post_submitter.dart`: the submission seam. Until the create-post Dart client from #16 is wired in, `UnavailablePostSubmitter` keeps drafts safe and reports posting as unavailable.

iOS keeps Keychain entries after an app is deleted. On the first launch of a new installation, `clearProtectedStorageAfterReinstall` wipes the previous installation's session and drafts. A draft that can no longer be decrypted, for example after the platform key is invalidated, is removed and the author is told.

Run the mobile checks from this directory:

```bash
flutter test
flutter analyze
```

See [the authentication compatibility slice](../../docs/dayli/authentication-compatibility.md) for the Worker proof and staging prerequisites.
