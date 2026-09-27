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

Start `pnpm dev:web:https` separately for the web app. `wrangler deploy` is not a normal local-development command. Do not deploy until staging has restricted database roles, Hyperdrive, exact HTTPS origins, and reviewed credentials. Staging has verified restricted roles and migrations, a cache-disabled Hyperdrive, and a deployed API Worker. Its private database proof passed, but browser authentication is untested. Production is not deployed.

Declare bindings, compatibility settings, scheduled triggers, and Durable Object migrations in `wrangler.jsonc`. Keep secrets and `.dev.vars` out of Git. PostgreSQL migrations are a separate controlled release step owned by `packages/db`; see [Database migrations](database-migrations.md).

Better Auth has local Worker and PostgreSQL coverage. Staging has a deployed API Worker but no web host. The Next.js app has dynamic routes and is not a static Cloudflare Pages export. The private Hyperdrive transaction proof passed; deployed authentication remains untested. FCM, sockets, and real R2 transfers are not implemented end to end.

### Web vinext Worker trial

`apps/web` has a local no-deploy vinext beta trial. It adds a Vite configuration and a separate `wrangler.jsonc` with no bindings, account data, route, zone, domain, or resource ID. The API Worker remains independently configured in `apps/api`. No application source imports Cloudflare APIs.

The existing `next dev`, `next build`, and `next start` scripts remain unchanged. The trial uses Node 24 and pnpm 10 with pinned dependencies:

```bash
pnpm --filter @dayli/web check:vinext
pnpm --filter @dayli/web dev:vinext
NEXT_PUBLIC_API_BASE_URL=https://api.staging.example.test pnpm --filter @dayli/web build:vinext
pnpm --filter @dayli/web start:vinext
```

`dev:vinext` uses port 3001. `start:vinext` previews the built Worker locally on port 8790. Neither command deploys, and the trial has no `deploy:vinext` script. `NEXT_PUBLIC_API_BASE_URL` is compiled into browser code. Every Worker build needs an exact HTTPS staging API origin with no path, query, fragment, or trailing slash. The command uses a non-routable example. Keep any real staging origin in ignored build configuration.

Cloudflare's [Next.js on Workers guide](https://developers.cloudflare.com/workers/framework-guides/web-apps/nextjs/) recommends vinext for Next.js 16, but vinext remains beta. The verified compatibility check reported 92% compatibility with 11 supported items, two partial items, and no setup issues. `next/font/google` loads from a CDN rather than self-hosting at build time. `next/image` has partial optimization support, and this trial does not configure Cloudflare Images or an image binding. The vinext build reports some dynamic routes as unknown. It does not prove deployed authentication, image optimization, bindings, or sign-in against a staging API.

`build:vinext` always runs `next typegen` after Vite, including when Vite fails. This restores the generated Next route declarations so the tracked `next-env.d.ts` stays unchanged and a standalone type check can run immediately afterward.

To switch off, use the unchanged Next scripts. To remove the trial, remove the vinext scripts and dependencies, `vite.config.ts`, `wrangler.jsonc`, the build wrapper, and their lockfile entries. Remove only the trial entries from `apps/web/.gitignore`. Do not delete that file if it already has other ignore rules. Restore React and React DOM to the previous pinned version if wanted, then run `pnpm install --frozen-lockfile`.

Cloudflare-first still includes external PostgreSQL, email, weather/music providers, and mobile push. Neon staging and production ownership/secrets remain administrator-managed. See [Environments](environments.md) for the boundary between local simulation, staging, and future production.

Use the [implementation reference](implementation-reference.md) for runtime checks and deployment pitfalls.

[Hono deployment](https://hono.dev/docs/getting-started/cloudflare-workers) · [Wrangler](https://developers.cloudflare.com/workers/wrangler/) · [Next.js hosting](https://developers.cloudflare.com/workers/framework-guides/web-apps/nextjs/) · [Scaling and costs](scalability.md)
