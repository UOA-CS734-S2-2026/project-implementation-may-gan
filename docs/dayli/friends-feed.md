# Friends feed

`GET /api/v1/feed` returns one page of released posts from the authenticated user's friends, newest Auckland day first. The web home page and the Flutter home screen both show it.

## Who sees what

A post appears only when all of these hold:

- its audience is `friends`,
- its release time (the next Auckland midnight) has passed,
- the author and viewer have an active friendship,
- neither user has an active block against the other,
- the author has a username.

The caller's own posts are not in the feed; they belong on the profile archive (#81). Following [product decisions](product-decisions.md), a new friendship exposes the friend's earlier released `friends` posts, and ending or blocking the friendship removes them from the next request.

Visibility comes from `buildDrizzlePostVisibilityFilter` in `apps/api/src/features/permissions`, the same predicate used for post detail, and is applied before the page limit. A hidden post therefore never appears in a page and never leaves a gap.

## Pagination

The response uses the standard `{ items, nextCursor, hasMore }` envelope. `limit` defaults to 20 and is at most 100. Pages are ordered by `(localDate, id)` descending. Neither value changes after a post is accepted, so paging never repeats or skips a post that did not change. The cursor is opaque; an altered cursor fails with `422 VALIDATION_FAILED` and `details.field = "cursor"`.

## Projection

Each item has the post ID, author (`id`, `username`, `displayName`), Auckland `localDate`, prompt, reflective answer, caption, rating, `audience` (always `friends`), `acceptedAt`, `releasedAt`, and `edited`. `edited` is true when a revision exists. Tomorrow notes are never included. Media is left out until download authorisation (#24) exists, and will be added as an optional field.

The whole page is one query with correlated `EXISTS` checks, so there are no per-post author, prompt, or revision lookups. Responses are `Cache-Control: no-store`.

## Clients

Web (`apps/web/features/feed`) reads the feed through the generated TypeScript client with a TanStack infinite query keyed by user ID, so switching accounts never shows the previous account's posts. Flutter (`lib/api/feed_client.dart`, `lib/home/feed_controller.dart`) decodes the response itself because the generated Dart `FeedPost` treats the nullable `caption` as required. Its controller drops a page superseded by a newer refresh, and keeps earlier posts visible with a notice when a refresh fails.

Both clients load more with a "Load more" button, skip a repeated post ID, offer a retry when the first page fails, and treat `401` as an ended session. Post cards have no image and no working detail page yet; both arrive with media authorisation (#24) and post detail (#74).

## Tests

`list-feed.route.test.ts` covers authentication, query validation, cursor errors, and concealed storage failures. `list-feed.repository.integration.test.ts` runs through the restricted `app` role against PostgreSQL. It covers solo, unreleased, own, stranger, ended, blocked-either-way, and username-less posts, historical posts, the edited marker, release at midnight, and stable pagination. It runs with the other post tests under `POSTS_POSTGRES_TEST=1` in `pnpm db:test`. Web coverage is `apps/web/tests/feed/Feed.test.tsx`. Flutter coverage is `feed_client_test.dart`, `feed_controller_test.dart`, and `home_feed_test.dart`.
