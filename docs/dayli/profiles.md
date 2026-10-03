# Profiles

A profile has a public name, a username, a bio, a visibility setting, and the [archive](profile-archive.md) of posts. The rules come from [product decisions](product-decisions.md#profiles).

## Reading a profile

`GET /api/v1/profiles/{username}` returns `id`, the current `username`, `displayName` (the public name, or the username when none is set), `detailsVisible`, and `bio`.

| Viewer | Bio |
|---|---|
| The owner | Always |
| Anyone signed in, on a public account | Shown |
| An active friend, on a private account | Shown |
| Anyone else, on a private account | `detailsVisible: false`, `bio: null` |

Unknown, banned, and blocked (either direction) handles are all `404`, matching the relationship card at `GET /api/v1/relationships/profiles/{username}`. The owner also gets `owner.profileVisibility` and `owner.usernameChangeAvailableAt`. Posts are friends only whatever the visibility; public visibility only affects [shared links](product-decisions.md#shared-links).

## About cards

`mbti` (one of the 16 types), `whatIDo`, and `listeningTo` (100 characters each) come back under the same rule as the bio, and `PATCH /api/v1/profile` sets them; null or blank clears one. They use the legacy `user` columns, so imported values carry over; a stored MBTI outside the 16 types reads as unset. Both clients show them as the original web app's rose, sky, and emerald cards, with a dash for anything unset.

## Profile actions

On someone else's profile, the friend button reads "add friend", "accept request", "requested" (tap to cancel), or "friends". "friends" asks for confirmation before removing, as the original web app did. "message" is a white, bordered button with a chat icon. The owner sees "Edit profile" instead.

## Streaks

The details also carry `streak`, shown under the same rule as the bio (null whenever the bio is hidden). `calculatePostingStreak` in `packages/domain` derives it from the Auckland days with an accepted post, following the rules proposed in #69:

- Solo and friends posts both count; drafts and failed submissions never reach the table. Each author has at most one post per day, so a retried submission cannot count twice.
- `current` is the run ending today, or ending yesterday while today is still open, so today never breaks a streak before its midnight. A whole missed day resets it to 0; `longest` keeps the best run.
- `postedToday`, `lastPostDate`, and `asOf` (the Auckland day the values were calculated for) come with it.
- Streaks are calculated on each read rather than stored, so deleting a post (#77) will lower them without a separate recalculation step.

The details also carry `stats`: `posts` (accepted posts, solo ones included, since the streak already shows which days had one), `friends` (active friendships), and `loved` (likes on posts that aren't in Trash), under the same rule.

Both clients show these in the original web app's stats tile: Posts, Friends, Loved, and the current streak as an orange "Day streak". The owner's friend count opens their friends list. The longest streak is in the API but not shown yet. Web refreshes profiles after a post is accepted.

Flutter (#70) also shows the owner, and only the owner, whether today's post is in: a small "Today's in" mark when it is, and nothing when it isn't, so the tile never prompts anyone to post. Screen readers hear the value and today's state either way ("2 Day streak, today's post is in"). A streak of 0 with no longest run reads "No streak yet". Flutter reloads the profile when it opens, after the server accepts or deletes one of your posts, and when the app returns to the foreground. `PostActivity` is fired by the submitter and post client wrappers in `AppServices`, so it goes out even if the composer or post screen has closed by the time the server answers. Pending and refused posts never trigger a reload, so only a confirmed value is ever shown.

Each time your own profile loads, Flutter keeps that streak and the time it arrived in protected storage (`ProtectedStreakCache`). It holds one account at a time, never anyone else's streak, and is wiped on sign-out, session expiry and account switch. Each profile load carries a generation, so only the newest one can change the screen or write the cache, and a write started before the cache was cleared is dropped. If a reload of your own profile fails offline, it stays on screen with "Last confirmed … · may be out of date" under the stats, and today's mark is hidden since the day may have moved on. Other profiles never fall back to stale data, since access to them can change, as after removing a friend. If your profile can't load at all offline, only the cached streak is shown, with the same marker. Pull to refresh tries again.

## Photos

A profile photo is a JPEG, PNG, or WebP image uploaded through the [media reservation](media-reservations.md) flow: reserve, `PUT` to R2 with the signed headers, then `/complete`. `PUT /api/v1/profile/avatar` with the validated `reservationId` makes it the photo, replacing any earlier one, and `DELETE /api/v1/profile/avatar` removes it. An upload that is someone else's or missing is `404`; one that has not passed validation, or is not one of those image types, is `409`. The link lives in `profile_avatars` (migration `0017_profile_avatars`), one row per account.

`avatarUrl` in the profile details is a presigned R2 `GET` link that expires after 10 minutes, signed only for a viewer who may see the bio. Without R2 configuration it is always null and the photo routes are unavailable, so local development shows initials. Provider photos, such as a Google account picture, are never used. The previous object is left in storage when a photo is replaced or removed; abandoned-upload cleanup (#163) must not delete an object still linked from `profile_avatars`.

Web uploads from **Settings**. Flutter shows the photo but does not upload one yet; it will reuse the media upload client from #170 once that merges.

## Editing

`PATCH /api/v1/profile` changes any of `bio` (160 characters), `publicName` (80 characters), and `profileVisibility`. Fields left out are unchanged, and null or blank text clears a field. Better Auth's generic `/update-user` still refuses `username` and `displayUsername`, so these dedicated routes are the only way to change them.

## Changing a username

`PUT /api/v1/profile/username` changes an established handle, at most once every 30 days (`409` with `details.reason = "tooSoon"` and `details.availableAt`). The previous handle is written to `username_reservations` for 30 days:

- Nobody else can claim it. Migration `0016_username_changes` extends the claim trigger to reject a live reservation held by another account, under the same per-handle advisory lock as other claims, so a claim and a reservation cannot race.
- `GET /api/v1/profiles/{old}` resolves to the owner's current profile. Web replaces `/u/{old}` with `/u/{new}`; Flutter moves to the new handle and updates the signed-in user when it is their own.

The handle change and its reservation are written in one transaction with the user row locked, so two changes from different devices cannot both pass the 30-day check. A taken or reserved handle is `409` with `details.reason = "taken"`.

## Clients

Web shows the bio beside the profile card and edits the profile, username, and visibility in **Settings**. Flutter shows the bio on the profile screen and edits everything on **Edit profile**, opened from **my days** or **Settings**. The Flutter client builds the `PATCH` body itself, because the generated Dart model would send omitted fields as null and clear them.

## Tests

The Postgres tests run through the restricted `app` role: `profile-details.repository.integration.test.ts` (visibility, blocks, literal `_`), `update-profile.repository.integration.test.ts`, and `change-username.repository.integration.test.ts` (reservation, reserved-handle claims, the 30-day wait, release after the reservation ends). Route tests cover each action's validation and error mapping, and that the new `PUT` does not add a second session check to the username setup routes. `packages/domain/src/posting-streak.test.ts` covers runs, a missed day, duplicate days, a leap day, and both daylight-saving changes, and the profile details integration test checks a streak end to end. Web coverage is `tests/profiles/ProfileSettings.test.tsx`, `ProfileStreak.test.tsx`, and the profile page test. Flutter coverage is `profile_client_test.dart`, `profile_details_test.dart` and `streak_test.dart` (new users, a one-day streak, a missed day, reload after posting and deleting, resume, offline and the cache).
