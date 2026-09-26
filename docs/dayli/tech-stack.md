# Tech stack

| Layer | Choice |
| --- | --- |
| Mobile | Flutter, Riverpod, GoRouter, Dio. |
| Web | Next.js, React, Tailwind, TanStack Query. |
| API | Hono on Cloudflare Workers, Zod, REST/OpenAPI. |
| Contracts | Generated Dart/Dio client and TypeScript models. |
| Auth | Better Auth, browser cookies, native bearer sessions. |
| Database | Neon PostgreSQL 18, Drizzle, Hyperdrive connection pooling for runtime reads/writes. |
| Realtime | Per-user Durable Objects with hibernating WebSockets. |
| Media | Private Cloudflare R2. |
| Jobs | PostgreSQL outbox and Worker scheduled handler. |
| Push | FCM/APNs. |
| Local data | Protected Drift/SQLite drafts; Keychain/Keystore credentials. |
| Abuse controls | Workers rate limiting plus transactional database quotas. |
| Tooling | Wrangler, pnpm workspaces, Dart tooling, GitHub Actions. |

Hono defines the API; Workers runs it; Wrangler develops and deploys it. A separate API gives web and mobile a clear shared backend with independent releases. Reuse existing services rather than rewriting business logic.

REST/OpenAPI replaces tRPC because Dart cannot consume TypeScript inference. PostgreSQL remains authoritative; Hyperdrive is a connection layer, not a database host. Start with query caching disabled.

## Deployment

`apps/api` is scaffolded. For the local HTTPS auth walkthrough, run:

```bash
pnpm local:auth:setup
pnpm db:dev:up
pnpm db:dev:migrate
pnpm dev:api:https
```

Start `pnpm dev:web:https` separately for the web app. `wrangler deploy` is not a normal local-development command. Do not deploy until staging has restricted database roles, Hyperdrive, exact HTTPS origins, and reviewed credentials. Staging has none of those bindings now, and production is not deployed.

Declare bindings, compatibility settings, scheduled triggers, and Durable Object migrations in `wrangler.jsonc`. Keep secrets and `.dev.vars` out of Git. PostgreSQL migrations are a separate controlled release step owned by `packages/db`; see [Database migrations](database-migrations.md).

Better Auth has local Worker and PostgreSQL coverage. Prove Drizzle/Hyperdrive transactions, FCM, sockets, real R2 transfers, and deployed authentication in provisioned staging before release. Next.js on Workers also needs a compatible deployment adapter; retain its existing host as fallback. Heavy media processing may need another service.

Cloudflare-first still includes external PostgreSQL, email, weather/music providers, and mobile push. Neon staging and production ownership/secrets remain administrator-managed. See [Environments](environments.md) for the boundary between local simulation, staging, and future production.

Use the [implementation reference](implementation-reference.md) for runtime checks and deployment pitfalls.

[Hono deployment](https://hono.dev/docs/getting-started/cloudflare-workers) · [Wrangler](https://developers.cloudflare.com/workers/wrangler/) · [Next.js hosting](https://developers.cloudflare.com/workers/framework-guides/web-apps/nextjs/) · [Scaling and costs](scalability.md)
