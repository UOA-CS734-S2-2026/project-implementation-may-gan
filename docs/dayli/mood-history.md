# Mood history

`GET /api/v1/profile/mood?range=30d|90d|1y` returns the caller's own daily ratings and two summaries. Web shows it on your own profile at `/u/{username}`, under the profile card. Nobody else can read it: the route has no username and always uses the session's account.

## What it returns

`range` defaults to `30d`. `1y` is the last 365 days. Every range ends today in Auckland.

| Field | Meaning |
|---|---|
| `days` | One `{ localDate, rating }` per posted day in the range, oldest first. Days without a post are left out |
| `current` | Summary of the range: `trackedDays`, `postedDays`, `missingDays`, `average` (one decimal place), `lowest`, `highest` |
| `previous` | The same summary for the same-length range just before, so clients can compare the two |
| `trackedFrom` | The account's first Auckland day, or its earliest post if an imported post is older |

Every post counts, solo and unreleased ones included, because they are the owner's own. Deleted posts are left out as soon as they are deleted. Days before `trackedFrom` are not tracked, so a new account isn't shown months of missing data. Today is not counted as missing while it is still open. `average`, `lowest` and `highest` are `null` when a range has no posts.

The summary logic is `summarizeMoodHistory` in `packages/domain`. The repository reads at most two ranges of one-per-day rows.

## Clients

The web section has a 30 days, 90 days or Year control, three tiles (average with its post count, the change from the range before with that range's average and post count, and days without a post), a chart, and a table view. The chart's line only joins consecutive days, so a missed day shows as a gap rather than an invented value. Over 90 days, only days with no posted neighbour keep a dot. Hovering or using the arrow keys reads out each day. The section only describes what was posted; it does not label moods or suggest causes.

Posting invalidates every `["profiles", userId]` query, which includes this one.

## Tests

`packages/domain/src/mood-history.test.ts` covers the windows (including a leap day), averages, today staying open, the previous range and the tracking start. `get-mood-history.repository.integration.test.ts` runs through the restricted `app` role and covers solo, unreleased and deleted posts, another author's posts, an imported account and an unknown account. `get-mood-history.route.test.ts` covers authentication, the range values, concealed storage failures and missing storage. Web coverage is `apps/web/tests/profiles/MoodHistory.test.tsx`.
