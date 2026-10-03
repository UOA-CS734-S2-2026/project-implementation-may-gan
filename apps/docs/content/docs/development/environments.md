---
title: Environments
description: How local configuration works and how it differs from staging and production.
---

# Environments

An environment is a separate place where Dayli runs, with its own configuration and data. Your local account isn't a staging account, and changing something locally doesn't change the team's deployed app.

If you just want to get started, follow [Local setup](/docs/development/local-setup). This page explains what those commands set up.

## What runs locally

The web app and mobile app both talk to the API. The API reads and writes to PostgreSQL.

| Service | Local address |
| --- | --- |
| Web app | `https://localhost:3000` |
| API | `https://localhost:8787` |
| Development database | `localhost:5434/dayli_dev` |

The database runs in Docker and keeps its data between restarts. The API runs locally through Wrangler, and the web app runs through Next.js.

We use HTTPS because authentication uses secure cookies. Both local server addresses are explicitly allowed by the auth configuration. Keep the hostnames and ports as shown rather than replacing them with another address.

## Where the configuration goes

You don't need to create these files by hand for the normal local setup.

`pnpm local:auth:setup` creates:

| File | What it does |
| --- | --- |
| `apps/api/.dev.vars` | Holds the local auth secret and trusted origins. |
| `apps/api/wrangler.local.jsonc` | Configures the local Worker. |
| `apps/web/.env.local` | Tells the web app where to find the local API. |

These files are ignored by Git. The HTTPS certificate and key are stored outside the repository, under `~/.local/state/dayli/mkcert` by default.

The API auth settings look like this. This is an explanation, not a file you need to copy:

```dotenv
BETTER_AUTH_SECRET=<generated locally by the setup script>
BETTER_AUTH_BASE_URL=https://localhost:8787
BETTER_AUTH_TRUSTED_ORIGINS=https://localhost:8787,https://localhost:3000
```

The secret is generated for you. Keep it private and don't replace it with the placeholder above.

The generated web configuration is:

```dotenv
NEXT_PUBLIC_API_BASE_URL=https://localhost:8787
```

`NEXT_PUBLIC_` values can be exposed to the browser. An API address is fine here, but passwords and secrets aren't.

## What about the env examples?

The root `.env.example` lists configuration for authentication, Google sign-in, email delivery, web builds, and database migrations. It is a reference template, not something the Worker automatically loads.

`apps/web/.env.example` shows staging-style web settings. Don't copy its example URLs unchanged into your local setup. The local setup script writes the localhost value you need.

You don't need Google or Resend credentials to run local email and password sign-in. Setting those services up is separate from getting the app running.

## Accessing staging

### In your browser

Open [the staging web app](https://staging.dayli.agroupforcoders.com). You don't need Docker, a local server, or any env files just to use it. Sign in or create a staging test account, not an account containing personal journal data.

Your local account won't work automatically because staging has its own database.

### From the mobile app on your computer

You can run a local mobile build against the deployed staging API. You need Flutter and the platform tools, but you don't need the local API, Docker database, mkcert certificate, or `adb reverse` mapping.

From the repository root, run:

```bash
cd apps/mobile
flutter pub get
flutter run --debug \
  --dart-define=DAYLI_API_BASE_URL=https://api.staging.dayli.agroupforcoders.com
```

Mobile reads the API address from `--dart-define`, not a `.env` file. Don't pass `DAYLI_DEV_CA_PEM_B64` for staging. If you previously created a local Android port mapping, remove it with `adb reverse --remove tcp:8787`.

The command above sets up the API connection. Google sign-in needs the team's public client IDs and the matching native app registration too. On Android, pass `DAYLI_GOOGLE_WEB_CLIENT_ID`; on iOS, also pass `DAYLI_GOOGLE_IOS_CLIENT_ID` and configure the ignored `apps/mobile/ios/Flutter/GoogleSignIn.xcconfig`. The full instructions are in `apps/mobile/README.md`. Never put a Google client secret in the mobile app.

### Can the local web app use the staging API?

Not by just changing `apps/web/.env.local`. The localhost web app and staging API are different sites. Trusted-origin checks and secure session cookie rules prevent that from being a drop-in replacement for local authentication.

Use the deployed staging web app to test staging in a browser, or keep the local web app connected to your local API. A custom mixed setup would need a separately reviewed auth configuration, not staging secrets copied onto your computer.

### Which files do I need?

| What you're doing | Configuration needed |
| --- | --- |
| Running the full local web setup | Generated `apps/api/.dev.vars`, `apps/api/wrangler.local.jsonc`, and `apps/web/.env.local`. |
| Running mobile against the local API | The same local API setup, plus the Dart settings in Running mobile locally below. |
| Using staging in your browser | None on your computer. |
| Running mobile against staging | `DAYLI_API_BASE_URL` passed to Flutter. Google needs extra platform configuration if you want to test it. |
| Deploying staging | Protected GitHub `staging` variables and secrets, not a copied local env file. |

Staging deployment is separate from accessing staging. Its workflow generates Worker configuration and web build settings from the protected GitHub environment. `STAGING_AUTH_API_ORIGIN` and `STAGING_AUTH_WEB_ORIGIN` identify the deployed origins, and `STAGING_BROWSER_PROXY_ENABLED` controls the approved browser auth mode. Don't change that mode as part of local setup.

The checked-in `apps/api/wrangler.staging.example.jsonc` is a configuration reference, not a ready-to-deploy file. Follow `docs/implementation/staging-deployment.md` for the complete deployment inputs and approval requirements.

There is no production environment to connect to yet.

## Database credentials

`pnpm db:dev:up` generates credentials in `~/.local/state/dayli/development-postgres.env` by default. If you set `XDG_STATE_HOME`, the credentials and certificate files go under its `dayli` directory instead.

The API launch script reads the restricted `app` credentials and connects the local Worker to the development database. The migration commands use the separate `migrator` role to change the schema. You don't need to paste either connection string into a web env file.

The development database uses port `5434`. The disposable test database uses port `5433`, so tests don't use your local accounts and posts. `pnpm verify:local` runs against the isolated test fixture, not your development database.

## Running mobile locally

Start with the same local setup and keep `pnpm dev:api:https` running. You don't need the web app running for mobile.

You'll need Flutter. Android also needs JDK 17, the Android SDK, and `adb`. The iOS Simulator needs a Mac with full Xcode and CocoaPods.

### Android emulator or USB device

Start your emulator or connect your development device. From the repository root, run:

```bash
adb reverse tcp:8787 tcp:8787
cd apps/mobile
flutter pub get
flutter run --debug \
  --dart-define=DAYLI_API_BASE_URL=https://localhost:8787 \
  --dart-define=DAYLI_DEV_CA_PEM_B64="$(base64 < "$(mkcert -CAROOT)/rootCA.pem" | tr -d '\n')"
```

The device mapping lets the app reach your computer's API through localhost. The certificate setting lets our debug build trust the mkcert root, because Dart's Android HTTP client doesn't use certificates installed in the user certificate store. Profile and release builds ignore this setting.

Pass `rootCA.pem`, never the private `rootCA-key.pem`.

When you're finished, remove the mapping:

```bash
adb reverse --remove tcp:8787
```

### iOS Simulator

Boot your Simulator. From the repository root, add the development certificate:

```bash
xcrun simctl bootstatus booted -b
xcrun simctl keychain booted add-root-cert "$(mkcert -CAROOT)/rootCA.pem"
```

Enable full certificate trust if the Simulator asks. Then run:

```bash
cd apps/mobile
flutter pub get
flutter run --dart-define=DAYLI_API_BASE_URL=https://localhost:8787
```

Restart the app or Simulator if it was running before you added the certificate. The existing environment guide still lists iOS Simulator authentication as needing a runtime check, so these instructions aren't a claim that it has been verified on a device.

## Local, staging, and production

We currently have local development and staging. Local runs on your own computer, and staging is the team's separate deployed environment for checking changes together.

Why keep them separate? Locally, you can change code, create test accounts, and try database changes without affecting anyone else's work. Staging gives the team a shared place to check that the deployed web app, mobile app, and API work together outside our own computers.

We don't have a production environment yet. That would be the live environment when we're ready to release Dayli. Keeping it separate would let us test changes in staging before releasing them to users, without mixing test posts and accounts with real user data.

Keep local and staging databases, credentials, and URLs separate. Don't point local migration commands at staging, and don't copy deployed credentials into your local files. When production is set up, it will need its own configuration and database too.

Deployment and provider setup are covered in the repository guides at `docs/dayli/environments.md` and `docs/implementation/staging-deployment.md`. They aren't required for the local setup above.

## When setup goes wrong

If the database won't start, check that Docker is running and port `5434` is available.

If HTTPS fails in the browser, check that you've run `mkcert -install` and are using the exact HTTPS localhost URL. Don't work around it by switching to HTTP.

If configuration is missing, run `pnpm local:auth:setup`. It deliberately refuses to overwrite conflicting auth settings. Read the error and check the existing local file rather than deleting it straight away.

If Android can't reach the API, check that the API is running, `adb reverse` is active, and both Dart settings were passed to the debug build.

If credentials are missing but the database volume still exists, stop before resetting it. The volume may contain data you want to keep. See `docs/dayli/environments.md` for the database lifecycle and explicit reset rules.
