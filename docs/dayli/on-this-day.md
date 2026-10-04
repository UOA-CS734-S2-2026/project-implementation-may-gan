# On This Day

`GET /api/v1/me/memories/on-this-day` returns the caller's own posts from today's Auckland month and day in earlier years. This is the API half of the On This Day feature (#39); no web or Flutter client reads it yet, and anniversary reminders are separate. The route is registered in the Worker and uses the generated clients' `posts.listOnThisDay` operation.

## Who sees what

The endpoint is owner-only. It reads the caller's own posts and nothing else: another user's post on the same date never appears, even a released `friends` post by an active friend that the caller could read elsewhere. The caller's `solo` and `friends` posts are both included, and each item carries its original `audience` so a client can label it.

It needs a session and a completed username, like the other interaction routes. A missing session is `401`, no username is `403`, and a failed username lookup is `503`. Responses are `Cache-Control: no-store`.

## Which day is "today"

"Today" is the server clock's current Auckland date, resolved with the same day calculation as the [posting day](../../packages/domain/src/auckland-day.ts). The response echoes it as `date`. The request has no parameters: a client cannot supply a date, a user, or a time zone, and changing a device clock changes nothing. Around Auckland midnight the date differs from UTC's, and the server follows Auckland.

## Which posts qualify

A post is a memory when all of these hold:

- the caller wrote it,
- its Auckland `localDate` has today's month and day in an earlier year,
- it was released at or before the server time,
- it is not in Trash or awaiting purge, and the account is not pending deletion.

The current year is never a memory. Trash and account state come from `buildDrizzlePostVisibilityFilter` with the `list` action, the same predicate as the [profile archive](profile-archive.md) and [post detail](post-detail.md), so the three cannot disagree. Content is the post's current content; `edited` is true when a revision exists, as elsewhere.

## Leap day

A post made on 29 February is skipped in a non-leap year and appears only on 29 February of a later leap year. The candidate dates are built one year at a time and validated (`on-this-day-dates.ts`), never by subtracting years or days from today, so a 29 February post cannot roll over to 28 February or 1 March. Today's date of 28 February or 1 March in 2027 therefore returns that day's posts only, and 29 February 2028 returns the posts from 29 February 2024 and 2020, not 28 February or 1 March 2027. Candidate years start at 2000, well before the product existed, and each year is checked on its own, so a century year such as 2100 is not treated as a leap year.

## Projection

The response is `{ date, items }`, with no paging. Each item has the post `id`, the Auckland `localDate`, `yearsAgo`, `rating`, `audience`, the stored `prompt` (`id`, `text`), `reflectiveAnswer`, `caption` (`null` when absent), `edited`, and `media`: the attached photos or video with private URLs that expire after 5 minutes, signed only for returned posts (see [Downloads](media-reservations.md#downloads)). A memory with media is a `503` when media storage is not configured. Tomorrow notes are never included.

Items are ordered newest year first. A user has at most one active post per Auckland day, so the list has at most one memory per year and stays small.

## Query

The repository builds the exact dates for each earlier year and asks for `(author_id, local_date)` pairs, rather than extracting the month and day from every row. That is the shape of the partial unique index `posts_author_local_date_active_unique` (author and day, rows not in Trash), so the cost does not grow with the author's history and no migration was needed. The visibility filter and the release check run in the same query, and a single query reads the media for the returned posts.

## Tests

`list-on-this-day.route.test.ts` covers `401` without a session, `403` without a username, an empty list, the response shape, the ignored client parameters, concealed storage failures, media signing, and the OpenAPI document. `on-this-day-dates.test.ts` covers the candidate dates and leap years. `list-on-this-day.repository.integration.test.ts` runs through the restricted `app` role and the real route with a fixed clock. It covers own posts only, other users' posts at the same date, the current year, Trash, pending purge, unreleased posts, a pending-deletion account, newest-year ordering, the Auckland-versus-UTC boundary, a 29 February post skipped in 2027 and returned for 29 February 2028, and the index shape. Fixtures are synthetic.
