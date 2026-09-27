# CS734 project - Team May Gan

Welcome to the project for COMPSCI 734 - Mobile, Web & Enterprise Computing. We look forward to seeing the amazing things you create this semester! This is your team's repository.

## Dayli proposal

Start with the [Dayli developer guide](docs/dayli/README.md) for the current code, MVP decisions, and known gaps. Use [Environments](docs/dayli/environments.md) for local auth and staging or production boundaries.

Your team members are:
- Andrew Qiu (aqiu604)
- Anton Garay (agar830)
- Jos Badenas (jbad180)
- JooHui Lee (eejl391)

You have complete control over how you run this repo. All your members will have admin access. The only thing setup by default is branch protections on `main`, requiring a PR with at least one code reviewer to modify `main` rather than direct pushes.

Please use good version control practices, such as feature branching, both to make it easier for markers to see your group's history and to lower the chances of you tripping over each other during development

![Team image](./team-image.png)

## Repository layout

- `apps/api`: Hono API deployed to Cloudflare Workers
- `apps/web`: Next.js web client
- `apps/mobile`: Flutter mobile client
- `packages/domain`: transport-independent business rules
- `packages/db`: Drizzle schema and PostgreSQL migrations
- `packages/contracts`: REST/OpenAPI contracts and generated TypeScript models

## Local setup

Install Node.js 24, pnpm 10, JDK 17, Docker with Compose, Flutter, and mkcert. Trust the local mkcert CA yourself, then run:

```bash
mkcert -install
pnpm install --frozen-lockfile
pnpm local:auth:setup
pnpm db:dev:up
pnpm db:dev:migrate
pnpm db:dev:verify
```

Start `pnpm dev:api:https` and `pnpm dev:web:https` in separate terminals. Sign up at `https://localhost:3000/sign-up`. See [Environments](docs/dayli/environments.md) before installing a development CA on a device.

GitHub-hosted PR and push verification is paused to preserve shared Actions minutes. Run the local verification suite before requesting review:

```bash
pnpm verify:local
```

Use `pnpm verify:local:full` when the debug Android APK build is required. See [Testing and delivery](docs/dayli/testing-and-delivery.md) for evidence recording and the temporary hosted-workflow policy.

For Android emulator or USB development, install the local CA on the device, then run `adb reverse tcp:8787 tcp:8787` before Flutter. For iOS Simulator, use a Mac with full Xcode and follow the certificate instructions in [Environments](docs/dayli/environments.md). In either case pass `--dart-define=DAYLI_API_BASE_URL=https://localhost:8787` to `flutter run`. [Environments](docs/dayli/environments.md) also covers the separate staging and production boundaries.
