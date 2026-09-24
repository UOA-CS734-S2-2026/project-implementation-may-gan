# Imported frontend attribution

Parts of this web app were imported from the WDCC Dayli frontend,
[UOA-CS732-S1-2026/group-project-wdcc](https://github.com/UOA-CS732-S1-2026/group-project-wdcc)
at commit `3f961fe`, under the reuse approval recorded in
[product decisions](../../docs/dayli/product-decisions.md#existing-frontend-reuse).

The verbatim copy is its own commit, so `git log --follow` shows each file's
original content before it was adapted to the Hono REST API.

## Imported and adapted

| Area | Files | Adaptation |
| --- | --- | --- |
| Styling | `app/globals.css`, `themes/*`, `utils/cn.ts`, `assets/*`, `public/dayli-logo.svg`, `public/dotgridbg.jpg`, `public/landing/*` | None. |
| Components | `components/ui/core/Button.tsx`, `components/ui/FormInput.tsx`, `components/ui/LiveClock.tsx`, `components/theme/ThemeMenu.tsx`, `components/ui/layout/NavLink.tsx`, `components/ui/layout/MobileNavCloseListener.tsx` | None. |
| Countdown | `components/ui/PostDeadlineCountdown.tsx` | Counts down to the server's `deadlineAt`, corrected for device clock skew, instead of the device's midnight. |
| Navigation | `components/ui/layout/Navbar.tsx` | Client component using the Better Auth session; links only to pages with a REST backend. |
| Session and auth | `lib/auth/client.ts`, `lib/session/*`, `lib/theme/provider.tsx`, `components/auth/GoogleSignInButton.tsx` | Better Auth client points at the API origin with credentials; username, admin, and plan fields removed. |
| Pages | `app/page.tsx`, `app/(auth)/*`, `app/(main)/layout.tsx`, `app/(main)/home`, `app/(main)/post`, `app/(main)/settings` | tRPC and server-side session calls replaced by `lib/api/*` and the client session; email-only sign-in; the composer submits text-only posts through `POST /api/v1/posts`. |

## Not imported

- The tRPC routers, Drizzle schema, migrations, seeds, Supabase, Cloudinary, Upstash, and SSE code: the backend is rebuilt in `apps/api` and `packages/db`.
- Profile, friends, post detail, comments, likes, messaging, search, mood graph, and media upload UI. They return with their REST APIs (#19–#24, #46, #47, #68, #79).
- Storybook, tests, credentials, build output, and dependencies.
