# Imported frontend attribution

Parts of this web app were imported from the WDCC Dayli frontend,
[UOA-CS732-S1-2026/group-project-wdcc](https://github.com/UOA-CS732-S1-2026/group-project-wdcc)
at commit `3f961fe`, under the reuse approval recorded in
[product decisions](../../docs/dayli/product-decisions.md#existing-frontend-reuse).

The verbatim copy is its own commit, so `git log --follow` shows each file's
original content before it was adapted to the Hono REST API.

## Imported and adapted

The UI keeps WDCC's markup and styling. Only the data sources change: tRPC and
server-side session calls are replaced by `lib/api/*` and the Better Auth
client session. Where a REST API does not exist yet, the WDCC UI stays and its
data is stubbed.

| Area | Files | Adaptation |
| --- | --- | --- |
| Styling | `app/globals.css`, `themes/*`, `utils/cn.ts`, `assets/*`, `public/dayli-logo.svg`, `public/dotgridbg.jpg`, `public/searchicon.svg`, `public/landing/*` | None. |
| Components | `components/ui/core/Button.tsx`, `components/ui/FormInput.tsx`, `components/ui/FormFileInput.tsx`, `components/ui/ImageCropper.tsx`, `components/ui/MediaInput.tsx`, `components/ui/PostCard.tsx`, `components/ui/LiveClock.tsx`, `components/theme/ThemeMenu.tsx`, `components/ui/layout/NavLink.tsx`, `components/ui/layout/MobileNavCloseListener.tsx`, `lib/cropImage.ts` | None. |
| Countdown | `components/ui/PostDeadlineCountdown.tsx` | Counts down to the server's `deadlineAt`, corrected for device clock skew, instead of the device's midnight. Same markup. |
| Navigation | `components/ui/layout/Navbar.tsx`, `components/ui/layout/NavSearch.tsx` | Client component using the Better Auth session. Profile links use the user id and the profile shows the email until usernames exist (#68). User search returns no results until the profile API. |
| Session and auth | `lib/auth/client.ts`, `lib/session/*`, `lib/theme/provider.tsx`, `components/auth/GoogleSignInButton.tsx`, `app/(auth)/sign-in`, `app/(auth)/sign-up` | Better Auth client points at the API origin with credentials. Username sign-in asks for an email and the sign-up username is not sent until #68. A "Forgot password?" link reaches the existing reset flow. |
| Feed | `app/(main)/home` | WDCC's feed grid and empty state; the feed is empty until the released-feed API (#19). |
| Composer | `app/(main)/post` | WDCC's media-first flow submits through `POST /api/v1/posts` with an idempotency key and audience `friends`. Chosen media is not uploaded until the media API lands. Editing and deleting are not available yet. |
| Settings | `app/(main)/settings` | Username shows "not set yet" and the visibility switch is disabled until the profile API (#68). |
| Placeholders | `app/(main)/[username]`, `app/(main)/[username]/friends`, `app/(main)/messages`, `components/ui/ComingSoon.tsx` | New: WDCC-styled placeholders so the WDCC navigation works until those APIs land. |

## Not imported

- The tRPC routers, Drizzle schema, migrations, seeds, Supabase, Cloudinary, Upstash, and SSE code: the backend is rebuilt in `apps/api` and `packages/db`.
- Post detail, comments, likes, messaging threads, friend lists, and the mood graph. They return with their REST APIs (#19–#24, #46, #47, #68, #79).
- Storybook, tests, credentials, and build output.
