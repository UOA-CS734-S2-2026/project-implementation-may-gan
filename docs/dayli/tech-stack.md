# Tech stack

## Recommended tools

| Responsibility | Choice |
| --- | --- |
| Mobile | Flutter, Riverpod, GoRouter, Dio. |
| Local data | Drift/SQLite with tested at-rest protection; Keychain/Keystore-backed credentials. |
| Native capabilities | Camera, location, recording, biometrics, push, and battery plugins; Swift/Kotlin channels where needed. |
| Web | Existing Next.js, React, Tailwind, TanStack Query. |
| Shared API | Hono on Cloudflare Workers, Zod validation, REST/OpenAPI. |
| Contracts | OpenAPI-generated Dart/Dio client and TypeScript models. Pin generator versions. |
| Identity | Better Auth in the API Worker, browser cookies, native bearer sessions. |
| Database | Supabase PostgreSQL, Drizzle, Hyperdrive with query caching disabled initially. |
| Realtime | Per-user Durable Objects using the WebSocket Hibernation API. |
| Media | Private R2 objects and authorised signed requests. |
| Jobs | PostgreSQL outbox/jobs, bounded Worker `scheduled` handler. Cloudflare Queues only when needed. |
| Abuse controls | Workers Rate Limiting binding plus database-enforced quotas and invariants. |
| Mobile notifications | FCM, with APNs for Apple delivery. |
| Development/deployment | Wrangler, pnpm workspaces, Dart tooling, GitHub Actions. |
| Tests | Vitest, Workers runtime tests, PostgreSQL integration tests, Playwright, Flutter tests, k6. |

Supabase remains the PostgreSQL host, not the identity provider. Hyperdrive pools connections; it does not host a database. Cloudflare D1 is SQLite-based and is not a drop-in PostgreSQL replacement.

R2 can also hold avatars, so Cloudinary is not required in the target stack. Existing public-avatar handling may stay temporarily during migration. Replace Upstash after testing equivalent abuse controls. Cloudflare's rate-limit counters are location-local and eventually consistent, not exact global quota accounting.

## Why a separate Hono API?

Hono supplies routes and middleware. Workers execute them. Wrangler runs local development and deploys the Worker.

Next.js routes would require less migration, and can also scale well. We chose a separate Worker for independent API releases, direct Cloudflare bindings, and a clear backend shared by Flutter and web. An always-on Node service remains an option if required dependencies or heavy processing do not fit Workers.

Keep reusable services rather than rewriting business logic. REST/OpenAPI replaces tRPC because Dart cannot consume TypeScript inference directly. GraphQL adds little to the initial bounded feed, post, history, and message operations. WebSockets carry updates; REST and PostgreSQL own commands and history.

## Deployment

The target is Cloudflare for API, realtime, storage, and scheduling. Next.js web deployment to Workers requires an adapter compatible with the exact Next.js version. Prove that build separately; retain the existing web host as a fallback rather than silently replacing Next.js with a different implementation.

Once `apps/api` has been scaffolded and its dependencies installed, typical commands are:

```bash
cd apps/api
pnpm exec wrangler dev
pnpm exec wrangler deploy
```

The proposal does not create this app yet. `wrangler.jsonc` will declare the entry point, compatibility settings, Hyperdrive/R2/Durable Object bindings, scheduled triggers, and Durable Object migrations. Secrets belong in Wrangler/platform secret storage; local `.dev.vars` stays untracked.

Deploy web and API independently from GitHub Actions. Run Drizzle migrations as a controlled release step using an appropriate database connection, not inside a request handler. Wrangler deployment does not migrate PostgreSQL automatically.

## Prove before committing to the runtime

- Better Auth sessions, password hashing, Google/native login, expiry, logout, and email recovery on Workers.
- Drizzle and the chosen PostgreSQL driver through Hyperdrive, including transactions. Follow driver connection-lifecycle guidance rather than reusing process-global connections blindly.
- Hibernation, authenticated socket upgrades, revocation, and reconnect catch-up.
- FCM HTTP v1 credential/token handling from Workers; do not assume every Node Admin SDK dependency works unchanged.
- Safe media validation within Worker limits. Heavy decoding/transcoding belongs in a suitable processing service if required.

External services still include PostgreSQL hosting, email, weather/music providers, and mobile push delivery. A Cloudflare-first design is not a claim that every dependency lives at Cloudflare.

## References

- [Hono on Workers](https://hono.dev/docs/getting-started/cloudflare-workers)
- [Wrangler](https://developers.cloudflare.com/workers/wrangler/)
- [Next.js deployment paths](https://developers.cloudflare.com/workers/framework-guides/web-apps/nextjs/)
- [Hyperdrive PostgreSQL](https://developers.cloudflare.com/hyperdrive/examples/connect-to-postgres/)
- [Better Auth bearer sessions](https://better-auth.com/docs/plugins/bearer)
- [Workers rate limiting](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/)

Capacity, pricing assumptions, and scaling decisions live in [Scalability](scalability.md), rather than being repeated here.
