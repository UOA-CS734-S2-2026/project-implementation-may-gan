# Environments

Use this guide for the local HTTPS authentication stack. Keep passwords, certificates, development CAs, API secrets, and connection strings out of Git and out of command output. The checked-in test fixture and `pnpm verify:local` remain separate from this persistent development database.

## Local HTTPS email and password authentication

The local stack uses these exact origins:

| Service | Origin | Purpose |
| --- | --- | --- |
| Web | `https://localhost:3000` | Next.js browser UI |
| API | `https://localhost:8787` | Wrangler, Better Auth, and Hono API |
| PostgreSQL | `localhost:5434/dayli_dev` | Docker-only development database |

Both HTTP servers use the same `localhost` certificate, but ports remain distinct origins. Better Auth explicitly trusts both origins and CORS allows credentialed browser requests from only those origins. The session cookie remains `Secure`, `HttpOnly`, and `SameSite=Lax`. Do not replace either URL with `http`, `127.0.0.1`, a LAN address, or an ad hoc hostname when testing browser authentication.

### Prerequisites

Install Node.js 24, pnpm 10, JDK 17, Docker with Compose, Flutter, and [mkcert](https://github.com/FiloSottile/mkcert). Android work also needs `adb`; iOS Simulator work needs full Xcode and CocoaPods. Run the following trust command yourself before setup, then approve its operating-system prompt if one is shown:

```bash
mkcert -install
```

This installs mkcert's local development CA into the current machine's trust store. It is a deliberate user action. Repository scripts never run `mkcert -install`, install a CA, touch production certificates, or create a public tunnel.

Install workspace dependencies from the repository root:

```bash
pnpm install --frozen-lockfile
```

### First run

The local scripts are optional setup helpers, not part of Better Auth or a deployed Worker. Without them, you would create a separate PostgreSQL database with `migrator` and `app`, run migrations directly as `migrator`, configure the local HTTPS certificate and ignored auth settings, then launch Wrangler with an `app`-only local Hyperdrive override and Next.js with HTTPS. The helpers repeat and check those steps so the Worker never receives the owner or migrator connection.

`local:auth:setup` generates a `localhost` certificate and key under `$XDG_STATE_HOME/dayli/mkcert` or `~/.local/state/dayli/mkcert`. It keeps the stable Better Auth secret in ignored `apps/api/.dev.vars`, writes the ignored local Wrangler configuration, and writes ignored `apps/web/.env.local` with the local API origin. It refuses to silently replace an existing local origin or secret configuration.

```bash
pnpm local:auth:setup
pnpm db:dev:up
pnpm db:dev:migrate
pnpm db:dev:verify
```

Start the API and web server in separate terminals:

```bash
pnpm dev:api:https
pnpm dev:web:https
```

Open `https://localhost:3000/sign-up`, create a local email and password account, then sign out and sign in. Email delivery is intentionally not configured for this local flow. The current Better Auth configuration permits email and password sign-in without email verification.

`NEXT_PUBLIC_API_BASE_URL` is required while Next.js is in development mode. If it is absent, the web app fails with an instruction to run `pnpm local:auth:setup` or set `apps/web/.env.local`; it never silently falls back to an HTTP API origin.

The API launch helper sets Wrangler's local Hyperdrive override to the generated restricted `app` role. The Worker has no owner or `migrator` connection string at runtime. `migrator` is used only by the explicit direct migration and verification commands above. The local Wrangler configuration contains only the `local-hyperdrive` label, not a Cloudflare resource ID, and `wrangler dev --local` does not contact Cloudflare Hyperdrive.

### Development database lifecycle

`packages/db/docker-compose.dev.yml` is a persistent local development database, independent of `packages/db/docker-compose.yml`, which is the disposable test fixture used by `pnpm verify:local`. Development uses Compose project `dayli-development`, Docker volume `dayli-development-postgres-data`, port 5434, and database `dayli_dev`. The test fixture uses port 5433 and `dayli_test`.

Credentials are generated once at `$XDG_STATE_HOME/dayli/development-postgres.env` or `~/.local/state/dayli/development-postgres.env`, with owner-only file permissions. If its Docker volume exists but that credential file is missing, `pnpm db:dev:up` stops rather than generating credentials that cannot unlock the existing data. Init scripts run only when the volume is first created. An older local volume may still contain the retired importer role; review any data you need before choosing the explicit reset command below.

```bash
pnpm db:dev:down       # stop and preserve data
pnpm db:dev:up         # restart or create the development database
pnpm db:dev:migrate    # only migrator@localhost:5434/dayli_dev is accepted
pnpm db:dev:verify     # read-only migration state check on that same target
pnpm db:dev:studio     # optional local Drizzle Studio browser, press Ctrl-C to stop
```

Studio reads only the generated local `app` credential and binds its proxy to `127.0.0.1`. Open the URL printed by the command in a browser. Studio can edit rows, so use it only with synthetic development accounts and do not treat it as a read-only inspection tool. It uses a browser UI served from `local.drizzle.studio`, not the deployed Worker or Hyperdrive. Never point it at staging or production.

Deletion is intentionally explicit and is the only command that removes development data and its generated credentials:

```bash
DAYLI_DEV_DB_RESET='DELETE development database' pnpm db:dev:reset
```

Do not point `MIGRATION_TARGET=development` at another host, port, database, or role. The migration tools reject every value except `migrator@localhost:5434/dayli_dev`. Do not use `pnpm verify:local` as a local-auth database reset: it creates and destroys an isolated fixture instead.

## Android debug builds

Android local authentication remains HTTPS-only. No manifest enables cleartext traffic.

The app's HTTP clients, including the generated API client and the native Better Auth session, use Dart's `HttpClient`. On Android it verifies TLS against the system CA store only. It ignores user-installed CAs and `network_security_config`, so installing the mkcert root on the device does not make `https://localhost:8787` reachable from the app. Debug builds instead accept the mkcert root through the `DAYLI_DEV_CA_PEM_B64` Dart define. `lib/main.dart` reads it only when `kDebugMode` is true and adds exactly that one certificate to Dart's default security context, on top of the system roots. Profile and release builds ignore it.

1. Ensure the emulator or USB device is running. Use only a development device or emulator.
2. Start `pnpm dev:api:https` on the development machine.
3. For a USB device or Android emulator, map device loopback to the API without exposing it on the LAN, then run a debug build with the base64-encoded mkcert root:

```bash
adb reverse tcp:8787 tcp:8787
cd apps/mobile
flutter run --debug \
  --dart-define=DAYLI_API_BASE_URL=https://localhost:8787 \
  --dart-define=DAYLI_DEV_CA_PEM_B64="$(base64 < "$(mkcert -CAROOT)/rootCA.pem" | tr -d '\n')"
```

4. Remove the mapping when finished:

```bash
adb reverse --remove tcp:8787
```

Pass `rootCA.pem`, never `rootCA-key.pem`. The app rejects a value that is not a single PEM certificate or that contains a private key. Do not pass the define to profile or release builds.

The debug manifest's `debug-overrides` still trusts user-installed CAs for Android platform networking, such as `HttpURLConnection` or a WebView. It does not affect Dart HTTP, and the app's API calls do not need a user-installed CA. Do not add `usesCleartextTraffic`, a cleartext domain configuration, or user CA trust to a release source set.

### Staging Android emulator

For staging, use the API Worker's public HTTPS custom domain as `DAYLI_API_BASE_URL` with the `flutter run` command in the [mobile guide](../../apps/mobile/README.md#running-the-app). The app calls that API directly; it does not use the staging web Worker. No local PostgreSQL, mkcert CA, or `adb reverse` is needed. Use a synthetic staging account and keep its password out of logs. A debug APK built and opened on an API 35 Google Play ARM64 emulator before the staging debug application ID was added. The debug app now installs as `nz.ac.auckland.dayli.dayli_mobile.staging`, separate from the old local APK. Native sign-in, session restoration, and Google sign-in still need manual checks. Post submission is connected but has not been checked against staging. Do not use a production origin or real account while testing staging.

## iOS Simulator

Keep App Transport Security unchanged. The API URL is HTTPS and this change does not add an ATS exception.

Prerequisites are Xcode with an installed iOS Simulator, a booted Simulator, mkcert already trusted on the host through the manual prerequisite above, and the local API running. Add the mkcert root to the currently booted Simulator with this explicit user command:

```bash
xcrun simctl bootstatus booted -b
xcrun simctl keychain booted add-root-cert "$(mkcert -CAROOT)/rootCA.pem"
```

If the Simulator asks for certificate trust, enable full trust in its certificate trust settings. Then run the app against the loopback API:

```bash
cd apps/mobile
flutter run --dart-define=DAYLI_API_BASE_URL=https://localhost:8787
```

Restart the app or Simulator if it was running when the CA was added. This implementation does not claim that an iOS Simulator runtime authentication flow was executed. Run the commands above and record the Simulator, iOS, Flutter, and Xcode versions before treating it as validated.

## Validation boundaries

The scripts and configuration can be checked locally without contacting Neon, Cloudflare, DNS, Google, Resend, staging, or production. Do not add local values to `wrangler.jsonc`, tracked environment files, GitHub workflow configuration, or a deployed Worker. The coordinated `staging-release.yml` workflow runs after successful main CI or by manual dispatch from main. It calls the reusable API and web deployment workflows in sequence. Local setup does not invoke any staging workflow.

## Staging and production

Local HTTPS authentication works. The staging owner reports restricted roles and grants verified, migrations `0000` through `0007` applied and verified, an `app` Hyperdrive with caching disabled, and a deployed API Worker on a custom HTTPS domain. The private Hyperdrive proof passed at `1fb6388` with sanitized evidence. The staging web Worker is deployed on an Active HTTPS custom domain. A synthetic browser email/password flow and sign-out redirect worked. Google, Resend, and native-device auth remain untested. No production service is deployed. The GitHub `staging` environment has main-only branch restrictions and credentials, but no required reviewer rule. The coordinated staging release automatically follows successful main CI and also supports manual dispatch. Its reusable API and web workflows cannot run independently. Cleanup and database migration workflows remain separate manual operations. Configure required staging reviewers before relying on an approval gate; the workflow definition does not create that gate.

Choose separate exact HTTPS web and API origins under the same registrable domain for each live environment. The coordinated staging release also requires `STAGING_AUTH_SITE_HOST`, a reviewed shared parent hostname of at least three labels containing both staging hosts. With staging proxy mode false, set the API origin as `BETTER_AUTH_BASE_URL`, include API and web origins in `BETTER_AUTH_TRUSTED_ORIGINS`, and build web and mobile clients with that API origin. The coordinated staging release captures `STAGING_BROWSER_PROXY_ENABLED` once. When approved proof enables it, Better Auth moves to the web origin while `PUBLIC_API_BASE_URL` and mobile remain on the direct API origin. Do not use a path, wildcard, trailing slash, localhost, a `workers.dev` endpoint, or a production origin for staging. Local certificates and local PostgreSQL credentials are never valid for staging or production.

### Remaining staging checks

The staging owner removed the temporary passwordless probe role. The `migrator` migration secret and Cloudflare proof credentials are stored in the main-only GitHub environment; the API Worker has its own Better Auth secret. Google and Resend are not enabled. Before inviting testers:

1. Add a required reviewer to the GitHub `staging` environment. Previous manual runs had explicit owner approval but no environment review gate.
2. Configure the staging Google clients and a verified Resend sender as described in [Authentication compatibility](authentication-compatibility.md). Keep their secrets out of Git and enable complete provider bindings in one reviewed Worker version. Until then, email/password remains the only configured provider.
3. Test Google on the staging web host and Android and iOS devices. Test password-reset delivery with an approved mailbox. Browser email/password and sign-out checks have passed manually, but native sessions, provider callbacks, and reset emails still need live tests.

Google OAuth and Resend requirements are in [Authentication compatibility](authentication-compatibility.md). Do not record credentials, connection strings, project IDs, tokens, certificate keys, reset links, or session tokens in Git, chat, PRs, logs, or tracked Wrangler files.

### Production reset and release

No production service is deployed. An old Neon production project may still exist. Before any deletion, its owner must inspect its databases and row counts, branches, restore points, connections, and teammate dependencies. If it is confirmed disposable, that owner, not a repository script or staging cleanup procedure, deletes that exact project in Neon Console. If it has already gone, skip deletion. Never delete or reset the new staging project as a substitute.

Only after staging authentication and provider checks pass, create a separate fresh production Neon project and protected `production` environment. Use distinct role credentials, Hyperdrive, Worker, Better Auth secret, OAuth clients, Resend sender, and origins. Do not copy staging data, restore points, credentials, or tokens. Confirm a restore point, run the protected manual migration workflow for the same reviewed commit that passed staging, review its sanitized evidence, and deploy the production Worker only after migration and authentication checks pass. Production Worker deployment automation is not present: use a reviewed ignored production Wrangler configuration, never the default Worker by accident. Do not invite production users until media submission and real-device checks are ready.
