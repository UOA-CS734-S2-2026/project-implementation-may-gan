# Authentication compatibility slice

Status: the compatibility slice has Worker and Flutter unit coverage. PostgreSQL persistence has a separate local integration suite. The private Hyperdrive proof passed at `1fb6388`. On staging, browser Google sign-in, refresh, and logout were manually observed. Resend password recovery, setting a new password, and rejection of the old password were also manually observed. Android Google sign-in succeeded with a distinct Google account. Android session persistence and logout were not checked, and iOS was not tested. Before this change, Android received `401 OAUTH_LINK_ERROR` when a Google email matched a password account, while a distinct Google account worked. That observation is the reason for explicit linking below. It is not evidence of full native coverage. The checked-in web and Flutter settings now offer a user-initiated Google-link flow.

The rollout order is local auth first, then staging with synthetic data, then a separate fresh production project. The staging owner reports verified restricted roles and migrations `0000` through `0007`. A cache-disabled Hyperdrive and API Worker are present. No production service is deployed; an old empty production Neon project may still need inventory and owner-led deletion or replacement. The coordinated staging release runs after successful main CI or by manual dispatch from main. It remains subject to the staging environment and approved proxy activation gates.

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

Google and Resend were exercised manually on staging as described in the status note, but this change has not been deployed or rechecked there. Local email/password auth works without either provider. Better Auth remains the only session authority: Google proves identity and Resend sends authentication email. The Worker validates every provider binding before it mounts authentication. Google or Resend may be disabled only by leaving every binding for that provider blank. Google requires all three client IDs and its Worker-only client secret. Resend requires both its API key and sender. A partial provider configuration is invalid and leaves authentication unmounted.

Use distinct, HTTPS API and web origins under the same schemeful site for each environment, such as `https://api.staging.example.test` and `https://web.staging.example.test`. The two origins must have the same registrable domain and HTTPS scheme so the API's `SameSite=Lax` session cookie remains same-site. They remain different origins, so the Worker still uses an exact CORS and trusted-origin allow-list. Do not use paths, trailing slashes, wildcards, localhost, or a production origin in staging.

The Worker uses Better Auth 1.7.5's Google provider. While staging proxy mode is false, its web redirect callback is the direct API origin followed by `/api/auth/callback/google`. Proxy mode makes Better Auth use the web origin's `/api/auth/callback/google` path. Register that exact web callback before setting `STAGING_BROWSER_PROXY_ENABLED=true` or deploying either stage in proxy mode. Keep both API and web callbacks registered throughout testing and rollback. The configured Google client ID order is web, iOS, Android. Better Auth uses the first value for the web authorization-code flow and accepts only those three values as ID-token audiences. It requests only `openid`, `email`, and `profile`, with online access and no incremental or offline Google API grant.

### Google Cloud projects

Use a separate Dayli Staging Google Cloud project. Set its Google Auth Platform audience to External / Testing and add each approved staging tester's Google account as a test user before any browser or device exercise. Branding and the Testing or Published audience apply to the whole project, not to one OAuth client. Never reuse a production client ID or client secret in staging. Keep production in its separate project and make its own publishing decision.

For the staging project, configure these clients before enabling the Worker bindings:

1. Create a Web application client. Set its Authorized JavaScript origin to the exact `STAGING_AUTH_WEB_ORIGIN` value. With proxy mode disabled, its Authorized redirect URI is the exact `STAGING_AUTH_API_ORIGIN` followed by `/api/auth/callback/google`. Before enabling proxy mode or deploying either stage in that mode, also register the exact `STAGING_AUTH_WEB_ORIGIN` followed by `/api/auth/callback/google`. Proxy mode uses the web callback; direct mode uses the API callback. Neither URI has a trailing slash. Keep both registered throughout testing and rollback. Both deployed origins must appear in `BETTER_AUTH_TRUSTED_ORIGINS`.
2. Create a staging Android client for the debug application ID `nz.ac.auckland.dayli.dayli_mobile.staging`. The `.staging` suffix keeps this client separate from an unknown existing package-and-fingerprint registration. Obtain the current debug SHA-1 with `./gradlew signingReport` from `apps/mobile/android` and register that debug fingerprint in the staging Google project. Do not delete or reuse an unknown OAuth client. Release builds retain `nz.ac.auckland.dayli.dayli_mobile`; they require their own reviewed Google client and signing certificate before release testing. Google Play App Signing requires the Play certificate if a Play-signed build is later used.
3. Create an iOS staging client for the checked-in staging bundle ID `nz.ac.auckland.dayli.dayliMobile`. Copy `apps/mobile/ios/Flutter/GoogleSignIn.xcconfig.example` to the ignored `GoogleSignIn.xcconfig` file and set `GOOGLE_REVERSED_CLIENT_ID` to that client's `REVERSED_CLIENT_ID`. `Runner/Info.plist` registers the reversed-client scheme in `CFBundleURLTypes`, allowing iOS to return to the app. Pass the iOS client ID to Flutter with `DAYLI_GOOGLE_IOS_CLIENT_ID`. Dart defines do not set Xcode build settings. Do not put an iOS client secret in Flutter because native clients do not use one.
4. `apps/mobile` uses `google_sign_in` 7.2.0 and requires Flutter 3.44 or later. Initialise `FlutterGoogleIdTokenProvider` with the web client ID as `serverClientId` and the iOS client ID as `clientId`. Android obtains its configuration from its Google client configuration. It submits only the short-lived Google ID token to `POST /api/auth/sign-in/social`, then stores Better Auth's signed `set-auth-token` handoff in protected storage. Do not request Google API scopes or server authorization codes.

### Resend

1. Use a team-owned Resend account and create separate staging and production sending domains or subdomains. Verify each domain in Resend before enabling the Worker binding.
2. Publish every DNS record Resend gives for the domain, usually SPF and DKIM. Add a DMARC record with a policy appropriate for the team's mail posture. SPF alone is not sufficient. Wait for Resend to report the domain as verified, then send a single non-production test message from the Resend dashboard if the team approves it.
3. Check the account's current sending limits, daily quota, recipient restrictions, and production-access requirements before inviting external users. This integration sends only on direct password-reset or verification requests. It does not send mail as a result of a schema migration.

### Worker, web, and GitHub configuration

Keep credentials only in an approved secret store. Do not put a secret in `wrangler.jsonc`, GitHub workflow output, shell history, or Git. The existing `BETTER_AUTH_SECRET` may be maintained with an interactive Wrangler secret update from `apps/api` and an ignored environment-specific configuration. Do not pipe, export, echo, paste into shell history, or commit a credential. Use separate production values and configuration.

```bash
wrangler secret list --config wrangler.staging.jsonc
```

`wrangler secret list` is a read-only name check. Confirm only the required names are present: `BETTER_AUTH_SECRET` always, `GOOGLE_CLIENT_SECRET` when Google is enabled, and `RESEND_API_KEY` when Resend is enabled. It does not reveal a secret value. Do not attempt to verify secrets by printing, exporting, or copying their values. Do not use `wrangler secret put` to first enable Google or Resend on the live Worker: adding one provider secret while its public bindings are blank is a partial configuration and deliberately unmounts authentication.

Create protected GitHub environments named `staging` and `production` before granting either one credentials. Restrict deployments to `main`, require the designated reviewers, dismiss stale approvals, and disable administrator bypass where the team's policy permits. Put deployment credentials only in that environment's approved secrets store, never repository-wide secrets or variables. The coordinated staging release requires `CLOUDFLARE_ACCOUNT_ID`, `STAGING_API_SERVICE_NAME`, `STAGING_HYPERDRIVE_NAME`, `STAGING_AUTH_SITE_HOST`, `STAGING_AUTH_API_ORIGIN`, and `STAGING_AUTH_WEB_ORIGIN` as public `staging` variables. `STAGING_BROWSER_PROXY_ENABLED` accepts only `true` or `false` and defaults to `false`; do not enable it before callback registration and the approved runtime proof. The site host is the reviewed shared parent of both custom staging hostnames.

The same protected `staging` environment carries these provider public values: `STAGING_GOOGLE_WEB_CLIENT_ID`, `STAGING_GOOGLE_IOS_CLIENT_ID`, `STAGING_GOOGLE_ANDROID_CLIENT_ID`, and `STAGING_RESEND_FROM`. Set the three Google variables together or leave all three blank. Set `STAGING_RESEND_FROM` only when `RESEND_API_KEY` is already a Worker secret. The workflow validates the origin pair, provider tuples, and sender format without logging their values. Before it deploys, it calls Cloudflare's read-only Worker secret list endpoint and checks binding names only. A missing required secret or a provider secret without its public bindings fails the run before Wrangler creates a Worker version.

The generated Worker `vars` always contain the exact Better Auth base URL and trusted-origin pair. They contain the three Google IDs only as a complete tuple and `RESEND_FROM` only as a valid sender. The workflow never copies a secret into `vars`. Keep it main-only. The coordinated release may run after successful main CI or by manual dispatch from main. Do not add pull-request, push, or `pull_request_target` events. When staging is re-provisioned, set `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_STAGING_HYPERDRIVE_ID` only as protected `staging` environment secrets. Give production a separate protected environment, token, Worker, database, Hyperdrive, Google clients, Resend domain, and Worker secrets.

Wrangler can upload public vars and new secrets together with `--secrets-file`, but a direct `wrangler deploy` publishes the version immediately. For the first activation of either provider, use a candidate-version rollout instead of updating a live secret. Prepare a reviewed ignored config with every current Worker binding, including the restricted Hyperdrive binding, exact HTTPS auth origins, and disabled `workers.dev` route. Include complete public bindings for each provider being enabled. The approved ignored secrets file must contain only those providers' matching new secrets: Google alone, Resend alone, or both if enabling both together. Do not add a provider secret without its complete public bindings. Run `wrangler versions upload --config wrangler.staging.jsonc --secrets-file <approved-ignored-file> --keep-vars --tag auth-provider-candidate`. `--keep-vars` preserves existing Worker vars that the candidate config does not list; it does not replace the need to review and preserve other bindings. This uploads an inactive version and applies the secret file additively, preserving the existing Better Auth secret. With separate approval, inspect the candidate configuration and activate only that version with `wrangler versions deploy --name dayli-api-staging --version-tag auth-provider-candidate --yes`. Do not put the file path or a secret value in Git, logs, or a command transcript. After the candidate is active, use the coordinated staging release for later reviewed deployments. If its name gate or tuple validation fails, the workflow makes no deployment and the existing Worker version remains active. If a post-deployment provider check fails, stop testing and roll back to the prior reviewed Worker version before changing configuration again. Do not run a credentialed staging workflow without separate approval.

The staging web workflow builds with `STAGING_AUTH_API_ORIGIN` as `NEXT_PUBLIC_API_BASE_URL`, `STAGING_AUTH_WEB_ORIGIN` as `NEXT_PUBLIC_WEB_API_BASE_URL`, and the captured mode as `NEXT_PUBLIC_WEB_API_PROXY_ENABLED`. These are public build settings, not secrets. The web client starts Google sign-in through the direct API when proxy mode is disabled or the web proxy when enabled. Google returns to the corresponding registered API or web callback, then Better Auth redirects only to a configured trusted origin. Do not add wildcard origins. Recovery and verification limits use Cloudflare's `CF-Connecting-IP` header. Keep the API directly behind Cloudflare. Do not route it through a proxy that lets clients supply that header.

For password recovery, the web client posts `redirectTo=https://<web-origin>/reset-password`. Better Auth sends a reset callback on its configured auth base URL, the API origin in direct mode or web origin in proxy mode, validates that destination against `BETTER_AUTH_TRUSTED_ORIGINS`, then forwards the short-lived token to `/reset-password`. The reset page removes the token from the browser address bar before showing the form and sends it once to Better Auth. A successful reset revokes every existing session. The reset token expires after 15 minutes and Better Auth consumes it once. Better Auth 1.7.5 verification links also expire after 15 minutes, but its signed verification JWT is not consumed on use. A product requirement for single-use verification links needs a custom verification flow before release. Verification remains optional.

### Manual validation

1. Run the Worker with complete staging bindings and apply reviewed migration `0002_add_better_auth_rate_limit` before enabling the provider configuration. Confirm the persistent `rateLimit` table exists. It applies recovery and verification limits across Worker isolates.
2. In a browser at the exact configured web origin, start Google sign-in. Confirm Google returns to `/api/auth/callback/google`, the API sets a secure HttpOnly cookie, and the browser returns to the exact web origin. Try an unlisted origin and confirm the Worker rejects it.
3. On an Android debug device, an Android release build, and iOS device, use the matching Google client. Confirm the emitted ID token audience is one of the configured web, iOS, or Android client IDs. Native SDK configuration can use the web client ID as `serverClientId`, so the audience is not necessarily the platform's client ID. Confirm the Worker issues `set-auth-token`, and logout, expiry, and password reset revoke the old bearer session. Test a token for a different client ID and a malformed token. Both must fail.
4. Request recovery for a real address and an unknown address. The browser response must be identical. Confirm only the real address receives one Resend message, the reset link expires after 15 minutes, and replaying it fails. Check Resend delivery status without copying message links into issue trackers or analytics.
5. Request verification for an unverified test account. Confirm it arrives from the verified sender and marks the account verified.

The checked-in web client has email/password sign-up and sign-in, Google-start, password-reset request, password-reset completion, and explicit Google-link settings screens. The Flutter shell presents the equivalent email/password, Google, and settings-link actions. Google remains unavailable in a local build without its client configuration. There is no verification-request screen yet. Do not claim Android persistence/logout or any iOS coverage until those checks are performed.

## Explicit Google linking and recovery

Google access and refresh tokens are acquired only through a new authorization. Better Auth identifies a Google account by `provider_id = google` and `account_id = <Google subject>`. `disableImplicitLinking: true` remains set, so a matching email can never merge a new Google subject during sign-in.

A signed-in password-account holder may instead choose **Connect Google** in web or Android settings. The Worker requires the current password in that same authenticated `/api/auth/link-social` request, verifies it with Better Auth's authoritative session check, removes it before passing the request to Better Auth, and then accepts only a verified Google email equal to the signed-in account email. A linked Google subject cannot be linked to another user. The check is server-side, so the settings confirmation alone cannot authorize a link. Native requests use the existing signed bearer session and do not replace or persist a new token.

If Google sign-in says the account is not linked, sign in with the password first and use **Connect Google** in Settings. Use the Google account with the exact same email and enter the current Dayli password. A different email or a Google account already connected to another Dayli account is rejected. If the password is unavailable, use the password-reset flow, sign in with the new password, and then link. Do not create a second account to work around the error; contact support if the Google account is already linked elsewhere.

Required follow-up staging checks: password-account collision rejection, explicit browser link, explicit Android bearer link, Android persistence and logout after linking, rejection of wrong email and already-linked subjects, and the equivalent iOS flow. No iOS result is claimed.

## Before deployment

Staging migrations ran through the protected workflow, and the deployed API Worker has its own `BETTER_AUTH_SECRET`. For another environment, apply reviewed migrations before deploying dependent code and store the Better Auth secret in the Worker secret store. Put only public URLs and exact browser origins in ignored Wrangler configuration. Do not put a secret, connection string, Hyperdrive ID, private hostname, reset token, or session token in Git. The private staging database proof passed, but Google, Resend delivery, password reset, and native Google sign-in still require deployed validation before release.
