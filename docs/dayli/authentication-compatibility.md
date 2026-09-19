# Authentication compatibility slice

Status: the compatibility slice has Worker and Flutter unit coverage. PostgreSQL persistence has a separate local integration suite. Neither result is a staging or physical-device result.

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

The compatibility instance uses Better Auth's memory adapter with fresh in-memory tables for each test. It is only an adapter for this test. The default local Worker does not register auth routes, so it cannot accidentally issue sessions from process memory.

## PostgreSQL persistence

The production path creates a fresh Drizzle client from `env.HYPERDRIVE` for each `/api/auth/*` request, then constructs Better Auth with its PostgreSQL Drizzle adapter. The handler closes the postgres.js client in `finally` after Better Auth resolves, which bounds client lifetime to the request without retaining connections in a Worker isolate. Runtime queries therefore use the restricted `app` role behind Hyperdrive. Migration commands alone use a direct `migrator` connection.

The additive `0001_better_auth_postgres` migration creates Better Auth 1.7.5 `user`, `account`, `session`, and `verification` tables. IDs are `text`, so a later approved import can retain legacy user IDs. The target user table also keeps the legacy profile fields: username, display username, bio, MBTI, what-I-do, listening-to, visibility, tier, role, and ban metadata. `username` is nullable for a new email/password registration, while imported rows retain their value. The account shape remains compatible with legacy provider and credential columns, but no legacy account, session, or verification rows are copied by this migration or the Worker.

Auth routes mount only when `HYPERDRIVE`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_BASE_URL`, and `BETTER_AUTH_TRUSTED_ORIGINS` validate. The secret must be at least 32 characters. The base URL and every comma-separated trusted origin must be exact HTTPS origins, and the base URL must be in the trusted-origin list. Auth routes fail closed for an untrusted `Origin`. Allowed origins receive credentialed CORS with only `GET`, `POST`, and `OPTIONS`, only `content-type` and `authorization` request headers, and the exposed `set-auth-token` header. There is no wildcard origin. Better Auth retains secure HttpOnly `SameSite=Lax` cookies and the signed bearer header used by Flutter.

Run local persistence coverage with the isolated PostgreSQL fixture:

```bash
pnpm db:test:up && pnpm db:test && pnpm db:test:down
```

It verifies registration, sign-in, persistence across independently built apps, expiry, logout, session revocation, invalid bearer authorization, stable legacy text IDs, profile fields, and account-row compatibility. It never contacts Supabase or a production database.

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

Before staging deployment, apply the reviewed migration through the protected migration workflow. Configure `BETTER_AUTH_SECRET` with `wrangler secret put BETTER_AUTH_SECRET` and place only the public base URL and exact browser origins in ignored staging configuration. Do not put a secret, connection string, Hyperdrive ID, or private hostname in Git. A deployed staging check and native device coverage remain required before release.

Run native iOS and Android sign-in, expiry, logout, revocation, protected-storage reinstall, passcode fallback, lockout, and enrolment-change checks before release. Google sign-in and password reset delivery also need provider and email configuration, then their own Worker and device tests.
