# CS734 project - Team May Gan

Welcome to the project for COMPSCI 734 - Mobile, Web & Enterprise Computing. We look forward to seeing the amazing things you create this semester! This is your team's repository.

## Dayli proposal

Start with the [Dayli developer onboarding and architecture proposal](docs/dayli/README.md). It covers the MVP, code reuse, Hono/Cloudflare stack, architecture, scalability, security, and testing. This is proposed work, not an implemented application.

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

Install Node.js 24, pnpm 10, and the stable Flutter SDK. Then run:

```bash
pnpm install
pnpm dev
```

Run the mobile client separately:

```bash
cd apps/mobile
flutter pub get
flutter run
```

See [`docs/dayli`](docs/dayli/README.md) for the proposed architecture and implementation order.
