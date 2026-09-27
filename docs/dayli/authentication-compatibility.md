# Authentication compatibility slice

Status: the compatibility slice has Worker and Flutter unit coverage. PostgreSQL persistence has a separate local integration suite. Neither result is a staging or physical-device result. The checked-in web client has email/password sign-up, sign-in, and password-recovery screens plus a Google button. The Flutter shell has email/password and Google buttons; its Google action reports that setup is unavailable when the build has no Google client configuration.

The rollout order is local auth first, then staging with synthetic data, then a separate fresh production project. The staging project owner reports restricted roles and grants verified, but application migrations have not run. Staging has no Worker, Hyperdrive, or deployment credentials for this project: the old Cloudflare staging Worker, Hyperdrive, and GitHub environment credentials were removed. No production service is deployed; an old empty production Neon project may still need inventory and owner-led deletion or replacement. Do not manually dispatch the staging proof, deploy, or run a credentialed check until staging has been re-provisioned and reviewed.

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

The additive `0001_better_auth_postgres` migration creates Better Auth 1.7.5 `user`, `account`, `session`, and `verification` tables. The additive `0002_add_better_auth_rate_limit` migration creates Better Auth's persistent `rateLimit` table for distributed Worker recovery limits. IDs are `text` stable application identifiers. The user table retains profile fields: username, display username, bio, MBTI, what-I-do, listening-to, visibility, tier, role, and ban metadata. `username` is nullable for new email/password registration. The account shape remains compatible with the configured provider and credential adapter. Schema migrations and the Worker do not copy external user, account, session, or verification records.

Auth routes mount only when `HYPERDRIVE`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_BASE_URL`, and `BETTER_AUTH_TRUSTED_ORIGINS` validate. The secret must be at least 32 characters. The base URL and every comma-separated trusted origin must be exact HTTPS origins, and the base URL must be in the trusted-origin list. Auth routes fail closed for an untrusted `Origin`. Allowed origins receive credentialed CORS with only `GET`, `POST`, and `OPTIONS`, only `content-type` and `authorization` request headers, and the exposed `set-auth-token` header. There is no wildcard origin. Better Auth retains secure HttpOnly `SameSite=Lax` cookies and the signed bearer header used by Flutter.

Run local persistence coverage with the isolated PostgreSQL fixture:

```bash
pnpm db:test:up && pnpm db:test && pnpm db:test:down
```

It verifies registration, sign-in, persistence across independently built apps, expiry, logout, session revocation, invalid bearer authorization, stable text IDs, profile fields, and account-row compatibility. It never contacts an external or production database.

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

## Google OAuth and Resend

Google OAuth and Resend are not enabled on a deployed Worker. The staging project owner reports a separate Google Cloud project in Testing and a staging Web OAuth client; native clients and Worker bindings are not configured. Local email/password auth works without either provider. Better Auth remains the only session authority: Google proves identity and Resend sends authentication email. The Worker validates every provider binding before it mounts authentication. Google or Resend may be disabled only by leaving every binding for that provider blank. Google requires all three client IDs and its Worker-only client secret. Resend requires both its API key and sender. A partial provider configuration is invalid and leaves authentication unmounted.

Use distinct, HTTPS API and web origins under the same schemeful site for each environment, such as `https://api.staging.example.test` and `https://web.staging.example.test`. The two origins must have the same registrable domain and HTTPS scheme so the API's `SameSite=Lax` session cookie remains same-site. They remain different origins, so the Worker still uses an exact CORS and trusted-origin allow-list. Do not use paths, trailing slashes, wildcards, localhost, or a production origin in staging.

The Worker uses Better Auth 1.7.5's Google provider. Its web redirect callback is the full API origin followed by `/api/auth/callback/google`. The configured Google client ID order is web, iOS, Android. Better Auth uses the first value for the web authorization-code flow and accepts only those three values as ID-token audiences. It requests only `openid`, `email`, and `profile`, with online access and no incremental or offline Google API grant.

### Google Cloud projects

The existing team-owned Dayli Google Cloud project is reserved for production. A separate Dayli Staging project has its own Branding and External / Testing audience, and its owner reports a staging Web client registered. Google Auth Platform branding and the Testing or Published audience apply to a whole project, not to an individual OAuth client. Production publishing can be managed independently. Never reuse a production client ID or client secret in staging.

For either environment's project, the client configuration is:

1. Create a Web application client. Add the exact web origin, for example `https://web.staging.example.test`, under Authorized JavaScript origins. Add the exact API callback, for example `https://api.staging.example.test/api/auth/callback/google`, under Authorized redirect URIs. The callback is not the web origin and must not have a trailing slash. The deployed API origin and web origin must both appear in `BETTER_AUTH_TRUSTED_ORIGINS`.
2. Create an Android client for package `nz.ac.auckland.dayli.dayli_mobile`. Register every SHA-1 certificate fingerprint that can sign a build users will run: local debug, the team's release signing key, and Google Play App Signing's release certificate if Play signs production packages. Get the current local debug fingerprint with `./gradlew signingReport` from `apps/mobile/android`. Treat fingerprints as environment-specific configuration and review them before release.
3. Create an iOS client for the app's final bundle ID. The checked-in project still derives its identifier from Xcode build settings, so set and freeze the production bundle ID before creating the production client. Copy `apps/mobile/ios/Flutter/GoogleSignIn.xcconfig.example` to the ignored `GoogleSignIn.xcconfig` file and set `GOOGLE_REVERSED_CLIENT_ID` to that iOS client's `REVERSED_CLIENT_ID`. `Runner/Info.plist` registers that value in `CFBundleURLTypes`, which lets iOS return to the app. Also pass the iOS client ID to Flutter with `DAYLI_GOOGLE_IOS_CLIENT_ID`. Dart defines do not set Xcode build settings. Do not paste an iOS client secret into Flutter because native clients do not use one.
4. `apps/mobile` uses `google_sign_in` 7.2.0 and requires Flutter 3.44 or later. Initialise `FlutterGoogleIdTokenProvider` with the web client ID as `serverClientId` and the iOS client ID as `clientId`. Android obtains its configuration from its Google client configuration. It submits only the short-lived Google ID token to `POST /api/auth/sign-in/social`, then stores Better Auth's signed `set-auth-token` handoff in protected storage. Do not request Google API scopes or server authorization codes.

### Resend

1. Use a team-owned Resend account and create separate staging and production sending domains or subdomains. Verify each domain in Resend before enabling the Worker binding.
2. Publish every DNS record Resend gives for the domain, usually SPF and DKIM. Add a DMARC record with a policy appropriate for the team's mail posture. SPF alone is not sufficient. Wait for Resend to report the domain as verified, then send a single non-production test message from the Resend dashboard if the team approves it.
3. Check the account's current sending limits, daily quota, recipient restrictions, and production-access requirements before inviting external users. This integration sends only on direct password-reset or verification requests. It does not send mail as a result of a schema migration.

### Worker, web, and GitHub configuration

Use an ignored environment-specific Worker configuration for public vars. Do not put any secret in `wrangler.jsonc`, GitHub workflow output, shell history, or Git. Client IDs and `RESEND_FROM` are public bindings, but configure them only when their matching Worker secrets are ready so each provider remains all-or-none.

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

Keep credentials only in an approved secret store. Retrieve a value only when needed, run each command from `apps/api` with the environment's ignored config, and enter it interactively at Wrangler's prompt. Do not pipe, export, echo, paste into shell history, or commit a credential. Repeat the same procedure with the production config and its separate values.

```bash
wrangler secret put BETTER_AUTH_SECRET --config wrangler.staging.jsonc
wrangler secret put GOOGLE_CLIENT_SECRET --config wrangler.staging.jsonc
wrangler secret put RESEND_API_KEY --config wrangler.staging.jsonc
```

Create protected GitHub environments named `staging` and `production` before granting either one credentials. Restrict deployments to `main`, require the designated reviewers, dismiss stale approvals, and disable administrator bypass where the team's policy permits. Put deployment credentials only in that environment's approved secrets store, never repository-wide secrets or variables. The existing manual staging workflow needs `CLOUDFLARE_ACCOUNT_ID`, `STAGING_API_SERVICE_NAME`, `STAGING_HYPERDRIVE_NAME`, `STAGING_AUTH_SITE_HOST`, `STAGING_AUTH_API_ORIGIN`, and `STAGING_AUTH_WEB_ORIGIN` as public `staging` variables. The site host is the reviewed shared parent of both custom staging hostnames. The workflow requires `main`, validates both exact HTTPS origins under that parent, and generates only these public Worker bindings:

```json
{
  "BETTER_AUTH_BASE_URL": "https://api.staging.example.test",
  "BETTER_AUTH_TRUSTED_ORIGINS": "https://api.staging.example.test,https://web.staging.example.test"
}
```

It does not copy a secret into `vars`. Keep the workflow manual. Do not add pull-request, push, or `pull_request_target` events. When staging is re-provisioned, set `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_STAGING_HYPERDRIVE_ID` only as protected `staging` environment secrets. Give production a separate protected environment, token, Worker, database, Hyperdrive, Google clients, Resend domain, and Worker secrets.

Copy `NEXT_PUBLIC_API_BASE_URL=https://api.staging.example.test` to the ignored `apps/web/.env.local` before building the web app. This is a public browser setting, not a secret. The web client sends Google users to the Worker, which returns Google's authorization URL. Google returns to the API callback, then Better Auth redirects only to a configured trusted origin. Do not add wildcard origins. Recovery and verification limits use Cloudflare's `CF-Connecting-IP` header. Keep the API directly behind Cloudflare. Do not route it through a proxy that lets clients supply that header.

For password recovery, the web client posts `redirectTo=https://<web-origin>/reset-password`. Better Auth sends the API reset callback in the email, validates that destination against `BETTER_AUTH_TRUSTED_ORIGINS`, then forwards the short-lived token to `/reset-password`. The reset page removes the token from the browser address bar before showing the form and sends it once to Better Auth. A successful reset revokes every existing session. The reset token expires after 15 minutes and Better Auth consumes it once. Better Auth 1.7.5 verification links also expire after 15 minutes, but its signed verification JWT is not consumed on use. A product requirement for single-use verification links needs a custom verification flow before release. Verification remains optional.

### Manual validation

1. Run the Worker with complete staging bindings and apply reviewed migration `0002_add_better_auth_rate_limit` before enabling the provider configuration. Confirm the persistent `rateLimit` table exists. It applies recovery and verification limits across Worker isolates.
2. In a browser at the exact configured web origin, start Google sign-in. Confirm Google returns to `/api/auth/callback/google`, the API sets a secure HttpOnly cookie, and the browser returns to the exact web origin. Try an unlisted origin and confirm the Worker rejects it.
3. On an Android debug device, an Android release build, and iOS device, use the matching Google client. Confirm the emitted ID token audience is one of the configured web, iOS, or Android client IDs. Native SDK configuration can use the web client ID as `serverClientId`, so the audience is not necessarily the platform's client ID. Confirm the Worker issues `set-auth-token`, and logout, expiry, and password reset revoke the old bearer session. Test a token for a different client ID and a malformed token. Both must fail.
4. Request recovery for a real address and an unknown address. The browser response must be identical. Confirm only the real address receives one Resend message, the reset link expires after 15 minutes, and replaying it fails. Check Resend delivery status without copying message links into issue trackers or analytics.
5. Request verification for an unverified test account. Confirm it arrives from the verified sender and marks the account verified.

The checked-in web client has email/password sign-up and sign-in, Google-start, password-reset request, and password-reset completion screens. The Flutter shell presents email/password and Google buttons. Google remains unavailable in a local build without its client configuration. There is no verification-request screen yet. Do not claim deployed or physical-device coverage until the team performs it.

Google access and refresh tokens are acquired only through a new authorization. Better Auth identifies a Google account by `provider_id = google` and `account_id = <Google subject>`. It disables implicit email-based account linking, so a matching email cannot merge a new Google subject into an existing account.

## Before deployment

Before staging deployment, apply the reviewed migration through the protected migration workflow. Configure `BETTER_AUTH_SECRET` with `wrangler secret put BETTER_AUTH_SECRET` and place only public URLs and exact browser origins in ignored staging configuration. Do not put a secret, connection string, Hyperdrive ID, private hostname, reset token, or session token in Git. A deployed staging check and native device coverage remain required before release.
