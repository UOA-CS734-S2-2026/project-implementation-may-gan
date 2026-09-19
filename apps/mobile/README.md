# Dayli mobile

The Flutter client calls the Hono Worker. Construct generated API clients with an explicit environment base URL. Do not use the generated client's default localhost URL.

`lib/auth/native_session.dart` owns native Better Auth bearer sessions. It stores the signed `set-auth-token` response header in Keychain or Android KeyStore through `flutter_secure_storage`. It sends the value only in the `Authorization: Bearer` header and clears it after a confirmed logout or when Better Auth reports no current session. Do not put session tokens in URLs, application logs, shared preferences, or source files.

Android disables automatic backup for protected storage. The application supports Android API 29 and newer. The iOS keychain entry uses `unlocked_this_device` accessibility.

Run the mobile checks from this directory:

```bash
flutter test
flutter analyze
```

See [the authentication compatibility slice](../../docs/dayli/authentication-compatibility.md) for the Worker proof and staging prerequisites.
