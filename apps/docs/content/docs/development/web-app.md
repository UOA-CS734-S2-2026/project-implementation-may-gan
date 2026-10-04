---
title: Web app
description: Follow a Dayli browser feature from its route to the API, state, interface, and tests.
---

# Web app

A web feature has a few different jobs hiding inside it. The URL must open the right screen. Private data must belong to the signed-in account. A request must use the API contract correctly. The page must still make sense while that request is loading, when it fails, and when it returns nothing.

Putting all of those jobs in one page component works for about five minutes. It then becomes difficult to tell whether a bug belongs to navigation, data loading, session handling, or rendering. Dayli separates those responsibilities so each part can be read and tested without reconstructing the whole application.

The web app is the Next.js application in `apps/web`. It uses the App Router, React, TypeScript, TanStack Query for feature server state, React Hook Form for larger forms, and Tailwind CSS for styling. This page explains how those pieces fit together in Dayli. It is not a general Next.js tutorial.

## The shape of a browser feature

A typical signed-in feature follows this path:

```text
App Router page
  -> feature component
  -> query or mutation hook
  -> app-owned API adapter
  -> generated TypeScript client
  -> Hono API
```

Each layer answers a different question:

- A route decides which screen a URL represents and which layout surrounds it.
- A feature component renders the interaction and its visible states.
- A query or mutation hook owns remote request state and cache behavior.
- An API adapter translates generated client results and HTTP failures into the smaller vocabulary the feature needs.
- The generated client owns request serialization and contract types.

This separation matters most when something goes wrong. A component should be able to say "show the offline message" without knowing how `ResponseError` works. An adapter should map a `401` without deciding which card appears on screen. The generated client should not contain handwritten Dayli behavior because client generation replaces that directory.

## Routes, layouts, and client boundaries

Next.js routes live under `apps/web/app`. A folder such as `(main)` is a route group. It chooses a shared layout but does not add text to the URL. For example:

- `app/(main)/home/page.tsx` owns `/home`.
- `app/(public)/u/[username]/page.tsx` owns a profile URL with a dynamic username. Its route group also allows signed-out visitors to open public profiles and posts.
- `app/(auth)/sign-in/page.tsx` owns `/sign-in` inside the authentication layout.
- `app/api/[...path]/route.ts` is an optional browser API proxy route, not a product screen.

Files in `app` are Server Components unless they begin with `"use client"`. Keep a route or layout on the server when it only reads route input, runs a server guard, and composes children. Move the interactive part behind a client boundary when it needs hooks, browser APIs, event handlers, or TanStack Query.

The home route shows the pattern. `app/(main)/home/page.tsx` awaits `searchParams`, builds a safe return path, runs `ServerUsernameGuard`, and renders `Feed`. The page does not fetch feed records itself. `features/feed/list-feed/Feed.tsx` is a Client Component because it uses query state, effects, local state, and navigation.

Layouts own UI that genuinely surrounds several routes:

- `app/layout.tsx` mounts the session and theme providers for the whole site.
- `app/(main)/layout.tsx` owns signed-in navigation, username setup gating, realtime messaging, and the private query scope.
- Route-local components such as `app/(main)/post/_components/PostForm.tsx` stay beside the route when they belong only to that screen.

Do not add `"use client"` to a whole route tree just because one button needs a click handler. A small client component keeps the server and client responsibilities visible.

## Who owns a file?

Dayli has two useful homes for browser UI code.

`apps/web/app` owns URLs, layouts, route parameters, and route-local presentation. `apps/web/features` owns behavior that is easier to understand as a product feature, such as feeds, posts, profiles, and messaging.

An established feature directory usually contains an action or view plus shared feature support:

```text
features/feed/
  list-feed/
    Feed.tsx
    use-feed-query.ts
  shared/
    feed.api.ts
    feed.keys.ts
    query-result.ts
```

Put a new reusable button or form primitive in `components/ui` only when more than one feature owns the same visual interaction. `components/ui/core/Button.tsx` is a real shared primitive. A post deletion dialog belongs to `features/posts/delete-post`, even though it contains buttons.

Cross-feature browser infrastructure belongs under `lib`, including session handling, API configuration, routing safety, legal helpers, and image utilities. A helper used by one feature should stay in that feature. "We may reuse it later" is not shared ownership yet.

## Server data and local form state

Server data is information whose current value comes from the API, such as the feed, a profile, or a post. TanStack Query owns the loading state, error state, cached result, refetching, and invalidation for that data.

Local state is an unfinished interaction on this browser, such as whether a dialog is open or what someone has typed into a form. React state or React Hook Form owns that state. Do not put every input keystroke into the query cache.

The posting screen makes the distinction concrete. `ClientPage.tsx` loads the current posting day because the server decides the prompt, deadline, and whether the account has posted. `PostForm.tsx` keeps the unfinished answer, rating, audience, and optional text in React Hook Form. On success it invalidates affected profile and post queries. Until the API accepts the post, those input values are not server state.

Use TanStack Query for a new read when the result should be cached, refetched, paged, or invalidated with related data. A small one-off screen may use explicit React state, as the current posting-day screen does. Follow the nearby implemented feature rather than converting unrelated code to make every screen identical.

## Keep private cache data tied to an account

A browser can sign out and sign in as another person without closing the tab. A cache key such as `["feed"]` could briefly show the first person's private feed to the second person. That is not merely stale UI. It is the wrong account's data.

Dayli protects private query data in two ways:

1. `MessagingProvider` keys its query scope by `user.id`. An account change unmounts the old `QueryProvider`, which cancels requests and clears its `QueryClient`.
2. Feature keys include the current user ID. The feed uses `["feed", userId]`, while post and profile key factories put `userId` before the resource identifier.

Private queries, such as the feed, wait for a real session user. Public profile and post queries can run after session resolution without a signed-in user; their keys use `"anonymous"` for that projection. When you add private server state, include identity in its query and mutation keys even when it already sits inside the private provider. The provider handles the account lifetime; the key prevents records from different viewers colliding within that lifetime.

Invalidate through the feature key factory where one exists. Broad string keys are present in older code, but a new feature should not invent a second key shape for the same records.

## A real walkthrough: the friends feed

The home feed is a useful example because it includes navigation, pagination, identity, a generated client, and all four visible data states.

### 1. The route opens the screen

`app/(main)/home/page.tsx` handles `/home`. It uses `ServerUsernameGuard` and renders `Feed` inside the main application layout.

### 2. The hook owns remote state

`features/feed/list-feed/use-feed-query.ts` calls `useInfiniteQuery`. Its key comes from `feedKeys.list(userId)`, and it does not run until `user.id` exists. The next cursor comes from the last returned page.

A cursor belongs to one Auckland feed day. If midnight passes between pages, the API returns the feature's `dayChanged` failure. The hook resets that account's feed query and starts from the new first page rather than joining two days into one list.

### 3. The adapter speaks to the API

`features/feed/shared/feed.api.ts` creates the generated `PostsApi` with `apiConfiguration()` and calls `postsListFeed`. It maps generated `ResponseError` and `FetchError` values into `FeedFailure` values such as `unauthenticated`, `network`, and `dayChanged`.

`query-result.ts` turns a failed result into `FeedApiError`. TanStack Query can then keep failures in its error state instead of caching them as successful page data.

The adapter does not decide what sentence appears on screen. It only gives the UI a stable, feature-sized result.

### 4. The component renders every outcome

`Feed.tsx` renders:

- a status message while the first page is pending
- an offline or general error with a retry button when no posts loaded
- one of the friendly empty messages after a successful empty response
- cards for loaded posts, plus a separate next-page error and retry path

It also deduplicates post IDs if pages were refetched around a change. An unauthenticated result replaces the route with `/sign-in`.

This division is worth copying. The screen owns words and actions. The hook owns asynchronous state. The adapter owns transport details.

## Sessions, guards, and the browser proxy

The API owns Better Auth. In the default browser mode, `lib/auth/client.ts` talks to the configured API origin and includes credentials so the browser sends its secure session cookie. `SessionProvider` exposes the resolved user to Client Components and keeps the first hydrated render consistent with server HTML.

Signed-in routes have a client gate in `UsernameSetupGate`. It waits for session resolution, sends signed-out visitors to `/sign-in`, and sends accounts without a username to `/setup-username`.

Dayli also has an explicitly enabled same-origin browser proxy mode. When `NEXT_PUBLIC_WEB_API_PROXY_ENABLED` is true:

- `app/api/[...path]/route.ts` forwards approved `/api/` requests through the configured server transport.
- server guards resolve the session and username before rendering protected content
- `app/auth/session-refresh/route.ts` applies cookie changes that a Server Component response cannot apply

When proxy mode is off, the server guard deliberately lets the client flow continue. Do not assume that adding `ServerUsernameGuard` alone protects a route in every deployment mode. API authorization remains authoritative in both modes. For the complete protocol and operational controls, use the accounts and authentication system documentation. Feature code should use the existing session helpers rather than reimplementing cookie or proxy logic.

Configuration is public browser configuration. `NEXT_PUBLIC_API_BASE_URL`, the proxy switch, and the proxy web origin are compiled for browser use. Never put a credential in a `NEXT_PUBLIC_` value. See [Environments](./environments) for the supported local and staging arrangements.

## Loading, empty, and error states are different

A blank screen makes several unrelated situations look the same. Treat these states separately:

- Loading means the result has not arrived. Use a status indicator or an intentional skeleton.
- Empty means the request succeeded and there is nothing to show. Explain what that means for this feature.
- Error means the request failed. Keep already loaded data visible when it is still useful, and offer a focused retry where retrying can work.
- Unauthenticated means the session is no longer usable. Hand control back to the session flow instead of showing a generic server error.

Pagination needs its own failure state. If page two fails, page one is still valid. The feed keeps those posts visible and lets the reader try "Load more" again.

Route-level `loading.tsx` and `error.tsx` files are not the current pattern in `apps/web`. Existing feature components render their request states directly. Follow that pattern unless a route tree genuinely needs a shared boundary.

## Styles and shared interface pieces

Global tokens, fonts, themes, and a small amount of cross-application CSS live in `app/globals.css` and `themes/`. Components use semantic Tailwind classes such as `bg-background`, `text-foreground-secondary`, and `font-serif` rather than copying theme color values.

Shared browser components live under `components`. Examples include the navigation in `components/ui/layout`, form controls in `components/ui`, and the common button in `components/ui/core`. Feature-specific views stay under `features`, while a component used only by one route can stay in that route's `_components` directory.

Before adding a new primitive, look for an existing Dayli component with the same behavior. Reuse its variants and semantic tokens. Do not move a feature component into `components/ui` merely because it has polished styling.

## Add a feature and its tests

For a new signed-in server-backed screen:

1. Add the route under the appropriate `app` route group. Keep the page server-side unless it needs browser behavior.
2. Put the product UI and data behavior under `features/<feature>` when it has an independent product owner. Keep one-screen pieces beside the route.
3. Add or extend an app-owned API adapter. Call the generated TypeScript client there and map failures into terms the feature can render.
4. Add query key factories that include the viewer's user ID, then add the query or mutation hook.
5. Render loading, empty, initial failure, stale-data failure, and signed-out behavior as applicable.
6. Add focused tests beside an established local owner or under `apps/web/tests/<feature>`.

Web tests currently live in both places. Route and component-local tests include `app/(main)/layout.test.tsx` and `components/ui/layout/NavSearch.test.tsx`. Larger feature tests include `tests/feed/Feed.test.tsx` and the `tests/messaging` and `tests/posts` directories. Follow the nearest feature's placement. The API `__tests__` convention described in [Repository structure](./repository-structure) is merged into `main` and applies only to API tests. It does not change web test placement.

The feed tests are a good checklist. They cover paging, empty and error states, an expired session, a midnight cursor change, and an account switch that must not retain the previous feed.

## Focused checks

Run these from the repository root:

```bash
pnpm --filter @dayli/web exec vitest run --config vitest.config.ts tests/feed/Feed.test.tsx
pnpm --filter @dayli/web test
pnpm --filter @dayli/web typecheck
pnpm --filter @dayli/web lint
pnpm --filter @dayli/web build
```

Use the focused test while working. Type checking and a Next.js build catch different server and client boundary mistakes, but neither proves a browser journey. Use `pnpm test:e2e:web` when the change needs the real HTTPS app, API, and browser path.

Read [Testing](./testing) for what each command proves and [Local setup](./local-setup) for running the app. Contract changes belong in the workflow from [API contracts and generated clients](./api-contracts-and-generated-clients), not in a hand edit to `packages/api-client-typescript`.

The web project also has a vinext beta build path for Cloudflare. The normal local app and the commands above use Next.js. Treat vinext as a separate deployment check, not as a different routing or feature architecture, and do not confuse either web build with the documentation app in `apps/docs`.
