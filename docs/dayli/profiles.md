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

The Postgres tests run through the restricted `app` role: `profile-details.repository.integration.test.ts` (visibility, blocks, literal `_`), `update-profile.repository.integration.test.ts`, and `change-username.repository.integration.test.ts` (reservation, reserved-handle claims, the 30-day wait, release after the reservation ends). Route tests cover each action's validation and error mapping, and that the new `PUT` does not add a second session check to the username setup routes. Web coverage is `tests/profiles/ProfileSettings.test.tsx` and the profile page test. Flutter coverage is `profile_client_test.dart` and `profile_details_test.dart`.
