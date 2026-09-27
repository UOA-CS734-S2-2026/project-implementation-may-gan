# Web vinext Worker trial

Status: local, no-deploy trial for `apps/web`. No Cloudflare account, resource, binding, DNS record, GitHub workflow, database, media upload, or migration was configured.

Cloudflare's [Next.js on Workers guide](https://developers.cloudflare.com/workers/framework-guides/web-apps/nextjs/) was checked on 27 September 2026. It recommends vinext for Next.js 16, describes `vinext init` as non-destructive, and labels vinext beta. The guide requires a compatibility check before production use. Cloudflare's [vinext compatibility dashboard](https://vinext.dev/compatibility) remains the source for feature-level support.

## Kept separate from the API Worker

The application source remains in `apps/web/app`, with the existing `next.config.ts`. Existing `next dev`, `next build`, and `next start` scripts remain unchanged. The API Worker remains independently configured in `apps/api`.

The trial adds the following web-only files:

- `apps/web/vite.config.ts`: vinext and the Cloudflare Vite plugin.
- `apps/web/wrangler.jsonc`: local Worker build metadata only. It has no bindings, account data, route, zone, domain, or resource ID.
- `apps/web/.gitignore`: ignores vinext output and Wrangler local state.

No application source imports Cloudflare APIs. The Vite configuration is the only Cloudflare-specific code in the web app.

## Pinned local commands

Use Node 24 and pnpm 10. The pinned vinext dependency set requires Node 22 or later, so Node 24.14.0 and pnpm 10.32.1 were accepted by the locked install.

```bash
pnpm --filter @dayli/web check:vinext
pnpm --filter @dayli/web dev:vinext
NEXT_PUBLIC_API_BASE_URL=https://api.staging.example.test pnpm --filter @dayli/web build:vinext
pnpm --filter @dayli/web start:vinext
```

`dev:vinext` uses port 3001. `start:vinext` uses port 8790 and is a local Wrangler preview of an already built Worker. Neither command deploys. This trial intentionally has no `deploy:vinext` script.

`NEXT_PUBLIC_API_BASE_URL` is compiled into browser code. Every Worker build must receive one exact HTTPS staging API origin with no path, query, fragment, or trailing slash. `https://api.staging.example.test` is a non-routable example for local build verification, not a deployed endpoint. Use the reviewed real staging origin only from ignored build configuration. The API must trust the matching exact web origin before a real sign-in test.

## Compatibility result and limits

`vinext check` reported 86% compatibility before initialization: 11 supported, two partial, and one setup issue. Adding `"type": "module"` resolved the reported setup issue. The follow-up check reported 92% compatibility: 11 supported, two partial, and no setup issues. The partial items remain:

- `next/font/google` loads fonts from a CDN rather than self-hosting them at build time.
- `next/image` validates the current remote patterns. vinext reports only partial image optimization support. This trial intentionally does not configure Cloudflare Images or any image binding.

The scanner found App Router layouts and 11 pages, and marked Better Auth, Tailwind, Zod, and React Hook Form compatible. The production build classified some routes as unknown because vinext cannot yet infer every dynamic API use. vinext build rewrites generated `next-env.d.ts` and `.next` route types. A subsequent Next build restores Next's generated declaration, so run `next build` before a standalone type check. It is not proof that authentication works against a deployed API. There is no staging API or web host, no cloud binding test, no image optimization test, and no deployed sign-in proof. Recheck compatibility and test the dynamic routes, remote images, and sign-in against an approved staging environment before any deployment decision.

## Switch off and removal

Use `pnpm --filter @dayli/web dev` and `pnpm --filter @dayli/web build` at any time to keep using Next.js. To remove the trial, delete the vinext scripts, dependencies, `vite.config.ts`, `wrangler.jsonc`, and `apps/web/.gitignore`; remove the related lockfile entries; restore React and React DOM to the previous pinned version if wanted; then run `pnpm install --frozen-lockfile`. No application code needs a Cloudflare-specific removal.
