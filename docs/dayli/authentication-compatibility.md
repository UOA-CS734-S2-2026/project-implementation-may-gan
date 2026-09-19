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

The additive `0001_better_auth_postgres` migration creates Better Auth 1.7.5 `user`, `account`, `session`, and `verification` tables. The additive `0002_add_better_auth_rate_limit` migration creates Better Auth's persistent `rateLimit` table for distributed Worker recovery limits. IDs are `text`, so a later approved import can retain legacy user IDs. The target user table also keeps the legacy profile fields: username, display username, bio, MBTI, what-I-do, listening-to, visibility, tier, role, and ban metadata. `username` is nullable for a new email/password registration, while imported rows retain their value. The account shape remains compatible with legacy provider and credential columns, but no legacy account, session, or verification rows are copied by this migration or the Worker.

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

## Google and Resend setup

Better Auth remains the only session authority. Google proves identity. Resend sends authentication email. The Worker validates every provider binding before it mounts authentication. Google or Resend may be disabled by leaving every binding for that provider blank. A partial provider configuration is invalid and leaves authentication unmounted.

The Worker uses Better Auth 1.7.5's Google provider. Its web redirect callback is exactly `https://<api-origin>/api/auth/callback/google`. The configured Google client ID order is web, iOS, Android. Better Auth uses the first value for the web authorization-code flow and accepts only those three values as ID-token audiences. It requests only `openid`, `email`, and `profile`, with online access and no incremental or offline Google API grant.

### Google Cloud project

1. Use a team-owned Google Cloud project. Do not use a personal project. Complete the Google Auth Platform branding details, support email, privacy-policy URL, terms URL if required, and audience. Keep the app in testing while development continues and add the team device accounts as test users. Complete Google's publishing and verification process before asking users outside that audience to sign in.
2. Create separate OAuth clients for staging and production. Never reuse a production client ID or client secret in staging.
3. For each environment, create a Web application client. Add the exact web origin, for example `https://web.staging.example.test`, under Authorized JavaScript origins. Add the exact API callback, for example `https://api.staging.example.test/api/auth/callback/google`, under Authorized redirect URIs. The callback is not the web origin and must not have a trailing slash. The deployed API origin must also appear in `BETTER_AUTH_TRUSTED_ORIGINS`.
4. Create an Android client for package `nz.ac.auckland.dayli.dayli_mobile`. Register every SHA-1 certificate fingerprint that can sign a build users will run: local debug, the team's release signing key, and Google Play App Signing's release certificate if Play signs production packages. Get the current local debug fingerprint with `./gradlew signingReport` from `apps/mobile/android`. Treat fingerprints as environment-specific configuration and review them before release.
5. Create an iOS client for the app's final bundle ID. The checked-in project still derives its identifier from Xcode build settings, so set and freeze the production bundle ID before creating the production client. Add the Google iOS configuration required by `google_sign_in` to ignored Apple project configuration. Do not paste an iOS client secret into Flutter because native clients do not use one.
6. `apps/mobile` uses `google_sign_in` 7.2.0 and requires Flutter 3.44 or later. Initialise `FlutterGoogleIdTokenProvider` with the web client ID as `serverClientId` and the iOS client ID as `clientId`. Android obtains its configuration from its Google client configuration. It submits only the short-lived Google ID token to `POST /api/auth/sign-in/social`, then stores Better Auth's signed `set-auth-token` handoff in protected storage. Do not request Google API scopes or server authorization codes.

### Resend

1. Use a team-owned Resend account and create separate staging and production sending domains or subdomains. Verify each domain in Resend before enabling the Worker binding.
2. Publish every DNS record Resend gives for the domain, usually SPF and DKIM. Add a DMARC record with a policy appropriate for the team's mail posture. SPF alone is not sufficient. Wait for Resend to report the domain as verified, then send a single non-production test message from the Resend dashboard if the team approves it.
3. Check the account's current sending limits, daily quota, recipient restrictions, and production-access requirements before inviting external users. This integration sends only on direct password-reset or verification requests. It never sends mail during user import.

### Worker and web configuration

Use an ignored environment-specific Worker configuration for public vars. Do not put any secret in `wrangler.jsonc`, GitHub workflow output, shell history, or Git.

```jsonc
{
  "vars": {
    "BETTER_AUTH_BASE_URL": "https://api.staging.example.test",
    "BETTER_AUTH_TRUSTED_ORIGINS": "https://api.staging.example.test,https://web.staging.example.test",
    "GOOGLE_WEB_CLIENT_ID": "replace-with-staging-web-client-id",
    "GOOGLE_IOS_CLIENT_ID": "replace-with-staging-ios-client-id",
    "GOOGLE_ANDROID_CLIENT_ID": "replace-with-staging-android-client-id",
    "RESEND_FROM": "Dayli <auth@staging.example.test>"
  }
}
```

Set sensitive Worker bindings from an approved secret store. Run each command from `apps/api`, use the environment's ignored config, and enter the value only at the prompt.

```bash
wrangler secret put BETTER_AUTH_SECRET --config wrangler.staging.jsonc
wrangler secret put GOOGLE_CLIENT_SECRET --config wrangler.staging.jsonc
wrangler secret put RESEND_API_KEY --config wrangler.staging.jsonc
```

Copy `NEXT_PUBLIC_API_BASE_URL=https://api.staging.example.test` to the ignored `apps/web/.env.local` before building the web app. This is a public browser setting, not a secret. The web client sends Google users to the Worker, which returns Google's authorization URL. Google returns to the API callback, then Better Auth redirects only to a configured trusted origin. Do not add wildcard origins. Recovery and verification limits use Cloudflare's `CF-Connecting-IP` header. Keep the API directly behind Cloudflare. Do not route it through a proxy that lets clients supply that header.

For password recovery, the web client posts `redirectTo=https://<web-origin>/reset-password`. Better Auth sends the API reset callback in the email, validates that destination against `BETTER_AUTH_TRUSTED_ORIGINS`, then forwards the short-lived token to `/reset-password`. The reset page removes the token from the browser address bar before showing the form and sends it once to Better Auth. A successful reset revokes every existing session. The reset token expires after 15 minutes and Better Auth consumes it once. Better Auth 1.7.5 verification links also expire after 15 minutes, but its signed verification JWT is not consumed on use. A product requirement for single-use verification links needs a custom verification flow before release. Verification remains optional, so imported users retain their `email_verified` state and are not locked out.

### Manual validation

1. Run the Worker with complete staging bindings and apply reviewed migration `0002_add_better_auth_rate_limit` before enabling the provider configuration. Confirm the persistent `rateLimit` table exists. It applies recovery and verification limits across Worker isolates.
2. In a browser at the exact configured web origin, start Google sign-in. Confirm Google returns to `/api/auth/callback/google`, the API sets a secure HttpOnly cookie, and the browser returns to the exact web origin. Try an unlisted origin and confirm the Worker rejects it.
3. On an Android debug device, an Android release build, and iOS device, use the matching Google client. Confirm the emitted ID token audience is one of the configured web, iOS, or Android client IDs. Native SDK configuration can use the web client ID as `serverClientId`, so the audience is not necessarily the platform's client ID. Confirm the Worker issues `set-auth-token`, and logout, expiry, and password reset revoke the old bearer session. Test a token for a different client ID and a malformed token. Both must fail.
4. Request recovery for a real address and an unknown address. The browser response must be identical. Confirm only the real address receives one Resend message, the reset link expires after 15 minutes, and replaying it fails. Check Resend delivery status without copying message links into issue trackers or analytics.
5. Request verification for an unverified test account. Confirm it arrives from the verified sender, marks the account verified, and does not send mail for imported users unless someone explicitly requests verification.

The checked-in web client has Google-start and password-reset completion screens. It does not yet include email/password sign-in or a verification-request screen, so teams need to add those product screens before claiming a complete email/password web flow. The Flutter helper is ready for a native Google button, but the shell does not yet present one. Do not claim physical-device coverage until the team performs it.

Old Google access and refresh tokens are not imported. Users authorize again. Migrated Google rows retain their `provider_id = google`, `account_id = <Google subject>`, and stable user ID. Better Auth resolves that exact pair first. It disables implicit email-based account linking, so a matching email cannot merge a new Google subject into a migrated account.

## Before deployment

Before staging deployment, apply the reviewed migration through the protected migration workflow. Configure `BETTER_AUTH_SECRET` with `wrangler secret put BETTER_AUTH_SECRET` and place only public URLs and exact browser origins in ignored staging configuration. Do not put a secret, connection string, Hyperdrive ID, private hostname, reset token, or session token in Git. A deployed staging check and native device coverage remain required before release.
