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
```

Deletion is intentionally explicit and is the only command that removes development data and its generated credentials:

```bash
DAYLI_DEV_DB_RESET='DELETE development database' pnpm db:dev:reset
```

Do not point `MIGRATION_TARGET=development` at another host, port, database, or role. The migration tools reject every value except `migrator@localhost:5434/dayli_dev`. Do not use `pnpm verify:local` as a local-auth database reset: it creates and destroys an isolated fixture instead.

## Android debug builds

Android local authentication remains HTTPS-only. The debug manifest trusts a user-installed CA through `debug-overrides`; release and profile manifests do not trust user CAs and no manifest enables cleartext traffic.

1. Ensure the emulator or USB device is running and manually install `$(mkcert -CAROOT)/rootCA.pem` as a **CA certificate** in its security settings. Use only a development device or emulator. This is separate from `mkcert -install` on the development machine.
2. Start `pnpm dev:api:https` on the development machine.
3. For a USB device or Android emulator, map device loopback to the API without exposing it on the LAN:

```bash
adb reverse tcp:8787 tcp:8787
cd apps/mobile
flutter run --debug --dart-define=DAYLI_API_BASE_URL=https://localhost:8787
```

4. Remove the mapping when finished:

```bash
adb reverse --remove tcp:8787
```

The debug-only trust override permits the mkcert user CA, not arbitrary cleartext. Do not add `usesCleartextTraffic`, a cleartext domain configuration, or user CA trust to a release source set.

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

The scripts and configuration can be checked locally without contacting Neon, Cloudflare, DNS, Google, Resend, staging, or production. Do not add local values to `wrangler.jsonc`, tracked environment files, GitHub workflow configuration, or a deployed Worker. The manual-only `staging-hyperdrive.yml` and `cleanup-hyperdrive-preview.yml` workflows remain available for later approved staging work; local setup does not invoke or modify them.

## Staging and production

Local HTTPS authentication is implemented. Staging is not: its new Neon project is empty, with no roles, migrations, Hyperdrive attachment, Worker, or validated endpoint. The old staging Worker, Hyperdrive configuration, GitHub `staging` environment credentials, and local staging Wrangler files were removed. The retained `staging-hyperdrive.yml` and `cleanup-hyperdrive-preview.yml` workflows are manual only and cannot run until approved staging credentials are re-provisioned. Their existence does not authorize a deployment or proof.

Choose separate exact HTTPS web and API origins under the same registrable domain for each live environment. Set the API origin as `BETTER_AUTH_BASE_URL`, include API and web origins in `BETTER_AUTH_TRUSTED_ORIGINS`, and build web and mobile clients with that API origin. Do not use a path, wildcard, trailing slash, localhost, a `workers.dev` endpoint, or a production origin for staging. Local certificates and local PostgreSQL credentials are never valid for staging or production.

### Staging checklist

Do not begin live provisioning until the user has reviewed and validated the blocked first-password procedure on the empty staging project. Then, in order:

1. Complete the two-role bootstrap and read-only role verification in [Database migrations](database-migrations.md). Use `migrator` only for direct migrations and `app` only behind Hyperdrive.
2. Configure the protected GitHub `staging` environment with main-only deployment and reviewer approval before adding credentials, including the direct unpooled `migrator` migration secret. Keep the migration, staging proof, and preview-cleanup workflows manual.
3. Create a new staging Hyperdrive binding for `app` with query caching disabled, then a new staging Worker with its own Better Auth secret and exact public origins. Leave Google and Resend absent until each provider is complete.
4. Build clients against the staging API and use synthetic accounts to prove sign-up, sign-in, cookie and bearer-session restoration, sign-out, protected calls, and rejection of an unlisted origin. Local tests are not a deployed Hyperdrive proof.

Google OAuth and Resend requirements are in [Authentication compatibility](authentication-compatibility.md). Do not record credentials, connection strings, project IDs, tokens, certificate keys, reset links, or session tokens in Git, chat, PRs, logs, or tracked Wrangler files.

### Production reset and release

No production service is deployed. An old Neon production project may still exist. Before any deletion, its owner must inspect its databases and row counts, branches, restore points, connections, and teammate dependencies. If it is confirmed disposable, that owner, not a repository script or staging cleanup procedure, deletes that exact project in Neon Console. If it has already gone, skip deletion. Never delete or reset the new staging project as a substitute.

Only after staging authentication and provider checks pass, create a separate fresh production Neon project and protected `production` environment. Use distinct role credentials, Hyperdrive, Worker, Better Auth secret, OAuth clients, Resend sender, and origins. Do not copy staging data, restore points, credentials, or tokens. Confirm a restore point, run the protected manual migration workflow for the same reviewed commit that passed staging, review its sanitized evidence, and deploy the production Worker only after migration and authentication checks pass. Production Worker deployment automation is not present: use a reviewed ignored production Wrangler configuration, never the default Worker by accident. Do not invite production users until media submission and real-device checks are ready.
