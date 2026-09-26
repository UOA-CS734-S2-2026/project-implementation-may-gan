# Local auth and environment setup

This is the order for a fresh Dayli installation. The new staging Neon project is empty. The old Dayli staging Worker, Hyperdrive configuration, GitHub staging credentials, and local staging Wrangler files have been removed. No production service is deployed. Do not put a database URL, password, token, certificate key, or project identifier in Git, chat, or a PR.

## 1. Run email/password auth locally

Install Node.js 24, pnpm 10, JDK 17, Docker with Compose, Flutter, and [mkcert](https://github.com/FiloSottile/mkcert). On your own development machine, run `mkcert -install` and approve the trust prompt. The repository scripts do not install a trusted root CA for you. Protect the local CA private key and never commit it.

From the repository root:

```bash
pnpm install --frozen-lockfile
pnpm local:auth:setup
pnpm db:dev:up
pnpm db:dev:migrate
pnpm db:dev:verify
```

Start `pnpm dev:api:https` and `pnpm dev:web:https` in separate terminals. Visit `https://localhost:3000/sign-up`, create a disposable local account, sign out, sign back in, and reload the page to check that the database-backed session persists. The API runs at `https://localhost:8787`. Both servers use the same local certificate, but their ports are separate origins. Google sign-in and emailed password reset are unavailable until their providers are configured. Do not put test data you need to retain in the disposable `pnpm verify:local` fixture.

For Android, install the mkcert root CA on a development emulator or USB device, run `adb reverse tcp:8787 tcp:8787`, then run Flutter with `--dart-define=DAYLI_API_BASE_URL=https://localhost:8787`. Remove the reverse mapping when finished. For iOS Simulator, select full Xcode, install CocoaPods if needed, boot a Simulator, trust the local CA there, and run Flutter with the same API definition. Follow the platform commands and limitations in [Environments](environments.md). The debug Android app trusts the user-installed CA; release builds do not. No iOS Simulator sign-in has been verified on this machine.

`pnpm db:dev:down` preserves local accounts. `pnpm db:dev:reset` requires an explicit deletion confirmation and removes that local database. `pnpm verify:local` tests a different, isolated PostgreSQL fixture. `pnpm verify:local:full` also builds a debug Android APK. GitHub PR and push checks are paused; a manually dispatched GitHub workflow still spends hosted minutes.

## 2. Decide the public origins

Choose HTTPS web and API origins under the same registrable domain in each environment. For example, staging could use `https://web.staging.example.com` and `https://api.staging.example.com`; production could use `https://example.com` and `https://api.example.com`. These are placeholders, not deployed endpoints. Use the exact API origin for `BETTER_AUTH_BASE_URL`, include both origins in `BETTER_AUTH_TRUSTED_ORIGINS`, and set the web build's `NEXT_PUBLIC_API_BASE_URL` to the API origin. Mobile builds use `DAYLI_API_BASE_URL`. Browser cookies are `Secure`, `HttpOnly`, and `SameSite=Lax`; an unrelated web hosting domain and a `workers.dev` API are not a substitute for the same-site domain plan.

## 3. Provision staging only after the Neon password block is cleared

Keep the already-created empty staging project. Do not run the role bootstrap yet. Neon rejected `psql`'s `\password` command, and a safe first-password method for restricted SQL-created roles has not been validated. [Database migrations](database-migrations.md#initial-role-passwords-blocked-pending-staging-validation) records the exact block. A future procedure must be reviewed and tested by you on the empty staging project without placing a plaintext password in SQL Editor, shell history, process arguments, logs, or chat. Never attach `neondb_owner` to Hyperdrive or a Worker.

Once that block is resolved:

1. Run the owner bootstrap for only `migrator` and `app`, establish their separate credentials through the approved method, run the migrator bootstrap directly as `migrator`, and require every read-only role check to return true.
2. Configure the protected GitHub `staging` environment before adding credentials. Restrict it to `main`, require a reviewer, and store the direct unpooled `migrator` connection as its migration secret. Dispatch the manual migration workflow from the reviewed `main` commit. It uses hosted minutes.
3. Create a staging Hyperdrive configuration with the restricted `app` login. Disable query caching. Create a new staging Worker bound to that configuration, with a unique `BETTER_AUTH_SECRET`, the exact public HTTPS origins, and no Google or Resend bindings yet. Store deployment credentials only in the staging environment or approved secret store, never in tracked Wrangler configuration.
4. Build the web and mobile clients against the staging API. With synthetic accounts, test sign-up, sign-in, cookie and bearer session restoration, sign-out, protected API calls, and rejection of an unlisted browser origin. A passing local test is not a deployed Hyperdrive proof. The retained staging workflow and PR-preview cleanup are manual only; do not run them before their staging credentials and safeguards are restored and reviewed.

## 4. Add Google, then Resend

Use team-owned Google Cloud and Resend accounts. In Google Auth Platform, set the app branding and audience and keep the OAuth app in testing with named test users while staging is under development. Create separate web, Android, and iOS OAuth clients for staging and production. Each web client needs the exact web JavaScript origin and `https://<api-origin>/api/auth/callback/google` as its redirect URI. Register the Android package and signing SHA-1 fingerprints. Freeze the iOS bundle ID, install the ignored iOS URL-scheme configuration, and set the mobile Google client IDs for the matching build. Put the web, iOS, and Android client IDs in the matching Worker public bindings and its web client secret in the Worker secret store. Configure all four together or leave all four absent. Test the web callback, Android debug and release signing as applicable, and iOS on real devices before claiming Google sign-in works.

In Resend, verify separate staging and production sending domains or subdomains and publish its required SPF and DKIM records plus an appropriate DMARC record. Check account limits and production sending access. Set `RESEND_FROM` and the Worker-only `RESEND_API_KEY` together. Test known and unknown address recovery, delivery, reset expiry and replay, and session revocation without recording reset links. Local email/password sign-in does not need Google or Resend. See [Authentication compatibility](authentication-compatibility.md) for provider and device details.

## 5. Reset the old empty production project and build production last

You previously confirmed no real production data or live clients. Recheck before deleting anything: inspect its databases and row counts, branches, restore points, Cloudflare or other connections, and any teammate dependency. Stop if the state has changed. If the old production Neon project still exists and is truly disposable, **you** delete that exact project in Neon Console. Do not delete it by following a staging SQL cleanup recipe. If it is already gone, skip deletion. Do not delete the new empty staging project again.

After staging auth, Google, and Resend have passed their agreed release tests, create a separate fresh production Neon project. Configure a protected GitHub `production` environment with a required reviewer and main-only deployment rule before adding credentials. At present that environment has not been created. Use new role credentials, Hyperdrive, Worker, auth secret, Google OAuth clients, Resend sender and API key, and public HTTPS origins. Do not copy staging data, restore points, credentials, or tokens. Confirm a production restore point, then run the protected manual migration for the same reviewed commit that succeeded in staging and inspect its sanitized evidence. Deploy the production Worker only after the migrations and auth checks pass. Production Worker deployment automation is not present; use a reviewed, ignored production Wrangler configuration rather than deploying the default Worker by accident.

The posting UI and auth screens being merged do not finish the media flow. Mobile still has an unavailable post submitter, and upload integration is owned separately. Do not invite production users until those paths and real-device checks are ready.
