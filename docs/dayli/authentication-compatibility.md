# Authentication compatibility slice

Status: Worker and Flutter unit coverage passed locally. This is not a staging or physical-device result.

Issue #10 tests Better Auth 1.7.5 in the Workers Vitest runtime. The slice uses email/password sessions, secure browser cookies, and Better Auth's signed bearer-session plugin. It is deliberately limited to authentication compatibility.

## What the Worker test proves

`apps/api/src/features/auth/route.test.ts` creates an isolated Better Auth instance and mounts its library-owned routes at `/api/auth/*`. It verifies:

- sign-up creates an HttpOnly, Secure, `SameSite=Lax` browser cookie;
- the `set-auth-token` response header carries a signed token that Better Auth accepts as a native bearer session;
- browser sign-up from an untrusted origin is rejected;
- malformed bearer tokens do not create a session;
- an expired session is rejected;
- logout invalidates its current session and session revocation invalidates the remaining session.

The test generates its signing secret at runtime. It does not print or commit a real session token, account, host, or credential.

The compatibility instance uses Better Auth's memory adapter with fresh in-memory tables for each test. It is only an adapter for this test. `app` does not register these routes by default, so the default Worker cannot accidentally issue sessions from process memory.

## Flutter handoff

`apps/mobile/lib/auth/native_session.dart` receives only Better Auth's `set-auth-token` header after native email/password sign-in. It stores that value through `flutter_secure_storage`, then sends it in the `Authorization: Bearer` header for `/api/auth/get-session` and `/api/auth/sign-out`. The generated OpenAPI client remains unchanged because Better Auth owns `/api/auth/*` outside the application OpenAPI contract.

Android disables automatic backup so encrypted storage material is not restored without its Android KeyStore key. The Android minimum SDK is 29, matching the supported-device decision. iOS stores the token in the Keychain with `unlocked_this_device` accessibility.

## Commands

Run the Worker proof from the repository root:

```bash
pnpm --filter @dayli/api test
```

Run the Flutter handoff tests:

```bash
cd apps/mobile
flutter test
flutter analyze
```

## Before deployment

This slice does not make Better Auth a deployable production authority yet. The production work needs Better Auth database tables in an additive Drizzle migration, a PostgreSQL adapter created from the request-scoped Hyperdrive client, ignored Worker secrets for the Better Auth secret and public base URL, exact deployed browser origins, credentialed CORS, and a deployed staging check.

Run native iOS and Android sign-in, expiry, logout, revocation, protected-storage reinstall, passcode fallback, lockout, and enrolment-change checks before release. Google sign-in and password reset delivery also need provider and email configuration, then their own Worker and device tests.
