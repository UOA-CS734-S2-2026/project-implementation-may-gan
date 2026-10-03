# Mood history

`GET /api/v1/profiles/{username}/mood?range=30d|90d|1y` returns one person's daily ratings and two summaries. Web shows it on the profile at `/u/{username}`, and Flutter on the profile screen and **my days**, under the profile card.

## Who sees it

It reaches the same people as the profile's posts.

| Viewer | Ratings |
|---|---|
| The owner | Every live post, including solo posts and today's post before it is released |
| An active friend | Released `friends` posts only |
| Anyone else | `403`. The clients don't show the section |
| Blocked in either direction, unknown or banned | `404`, the same as the profile |

Ratings come through `buildDrizzlePostVisibilityFilter` with the `list` action, the same predicate as the [profile archive](profile-archive.md). The profile lookup is shared with that route in `posts/shared/profile-owner.ts`. Posts in Trash are left out for everyone.

## What it returns

`range` defaults to `30d`. `1y` is the last 365 days. Every range ends today in Auckland.

| Field | Meaning |
|---|---|
| `days` | One `{ localDate, rating }` per rated day the caller can see, oldest first |
| `hiddenDays` | Days in the range with a post the caller can't see, such as a solo post. They are neither rated nor missing, so a friend's view agrees with the streak |
| `current` | Summary of the range: `trackedDays`, `postedDays` (visible ratings), `missingDays`, `average` (one decimal place), `lowest`, `highest` |
| `previous` | The same summary for the same-length range just before. The clients don't show either summary yet |
| `trackedFrom` | The account's first Auckland day, or its earliest post if an imported post is older |

Days before `trackedFrom` are not tracked, so a new account isn't shown months of missing data. Today is not missing while it is still open. `average`, `lowest` and `highest` are `null` when a range has no visible ratings.

The summary logic is `summarizeMoodHistory` in `packages/domain`. The repository reads at most two ranges of one-per-day rows.

## Clients

Both clients follow the original web app's weekly mood graph: a card with a 30 days, 90 days or Year control and a chart with an accent line, `foreground-accent` dots and an empty baseline circle for each day without any post. The line only joins consecutive days, so a missed day shows as a gap rather than an invented value. Over 90 days, only days with no posted neighbour keep a dot. Hovering, tapping, dragging or the arrow keys read out a day. The section only describes what was posted; it does not label moods or suggest causes.

Posting invalidates every `["profiles", userId]` query on web, which includes this one. Flutter reloads it on pull to refresh.

## Tests

`packages/domain/src/mood-history.test.ts` covers the windows (including a leap day), averages, today staying open, hidden days, the previous range and the tracking start. `get-profile-mood.repository.integration.test.ts` runs through the restricted `app` role and covers the owner's solo, unreleased and trashed posts, a friend's view, strangers (`403`), blocks and unknown handles (`404`), and an imported account. `get-profile-mood.route.test.ts` covers authentication, the range values, both refusals, concealed storage failures and missing storage. Web coverage is `apps/web/tests/profiles/MoodHistory.test.tsx`; Flutter coverage is `apps/mobile/test/mood_history_test.dart`.
