---
title: Local setup
description: The quickest way to get Dayli running on your computer.
---

# Local setup

So you want to work on Dayli? Let's get the web app running first. This gives you a local account and database without needing access to staging.

If you want to know what the configuration does, have a look at [Environments](/docs/development/environments). That page also covers running the mobile app against your local API.

Want to try the team's deployed version instead? Skip the local setup and follow [Accessing staging](/docs/development/environments#accessing-staging). No local env files are needed to use it in your browser.

## What you need

Install Node.js 24, pnpm 10, Docker with Compose, and [mkcert](https://github.com/FiloSottile/mkcert). Make sure Docker is running.

Open a terminal at the repository root. All the commands below run from there.

## First-time setup

We use HTTPS locally so sign-in works with secure cookies. Start by trusting mkcert's development certificate authority on your computer:

```bash
mkcert -install
```

Approve the system prompt if one appears. Only do this on a machine you're using for development.

Then run:

```bash
pnpm install --frozen-lockfile
pnpm local:auth:setup
pnpm db:dev:up
pnpm db:dev:migrate
pnpm db:dev:verify
```

This installs the dependencies, generates your local configuration, and starts and prepares the database. You don't need to copy `.env.example` or fill in credentials yourself for this setup.

## Start the app

Open two terminals at the repository root. In the first, start the API:

```bash
pnpm dev:api:https
```

In the second, start the web app:

```bash
pnpm dev:web:https
```

Open [https://localhost:3000/sign-up](https://localhost:3000/sign-up) and create a test account. Local email and password sign-in doesn't require email verification. Email delivery isn't configured locally.

Keep the exact HTTPS localhost address. Changing it to HTTP or `127.0.0.1` can break sign-in.

## Next time

Start Docker and run `pnpm db:dev:up`, then start the API and web app again. You don't need to repeat the first-time setup.

If you've pulled new database migrations, run `pnpm db:dev:migrate` and `pnpm db:dev:verify` too.

To stop the app, press `Ctrl-C` in both server terminals. Stop the database with:

```bash
pnpm db:dev:down
```

Your local accounts and posts are kept for next time.

If something isn't working, check the [local troubleshooting notes](/docs/development/environments#when-setup-goes-wrong) before deleting configuration or resetting the database.
