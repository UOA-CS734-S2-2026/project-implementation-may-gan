# Profile archive

`GET /api/v1/profiles/{username}/posts` returns one person's posts, newest Auckland day first. Web shows them under the profile card at `/u/{username}`. Flutter shows them on the profile screen and on the **my days** tab, which is your own profile.

## Who sees which posts

| Viewer | Posts on the profile |
|---|---|
| The owner | Every post, including solo posts and today's post before it is released |
| An active friend | Released `friends` posts only |
| Anyone else, or after the friendship ends | None. The page is empty, not a 404 |
| Blocked in either direction | The profile is `404`, the same as an unknown or banned handle |

Visibility comes from `buildDrizzlePostVisibilityFilter` with the `list` action, the same predicate the [friends feed](friends-feed.md) and [post detail](post-detail.md) use, applied before the page limit. Access is checked again on every page, so unfriending or blocking takes effect on the next request. A public profile does not expose posts to non-friends; public visibility only affects [shared links](product-decisions.md#shared-links).

The handle is matched case-insensitively and literally (an `_` is not a wildcard). A legacy handle that matches more than one account resolves to neither.

## Projection and paging

Each item has the same fields as a feed post, plus `audience` (`solo` or `friends`) and `released`. Only the owner ever sees `solo` or `released: false`; the clients label those posts "Only you" and "Not released yet". Tomorrow notes are never included. Media thumbnails are left out until posts link attachments and download authorisation exists (#24).

Paging uses the same opaque `(localDate, id)` cursor as the feed, in `posts/shared/post-page-cursor.ts`. `limit` defaults to 20 and is at most 100. An unreadable cursor is `422` with `details.field = "cursor"`. Responses are `Cache-Control: no-store`.

## Clients

The web profile page renders the archive only for the owner and active friends, and asks anyone else to add the person as a friend. Cards open the post at `/u/{username}/{postId}`. Flutter uses the shared `PostPager` (also behind the feed) and `PostPreviewCard`. It drops the list as soon as the viewer removes the friend, and pull-to-refresh reloads the profile and its posts.

## Tests

`list-profile-posts.repository.integration.test.ts` runs through the restricted `app` role. It covers the owner's solo and unreleased posts, a friend's view, release at midnight, strangers and ended friendships (empty), blocks in both directions, unknown and banned handles (404), case-insensitive and literal `_` matching, and paging without repeats. `list-profile-posts.route.test.ts` covers authentication, validation, 404, cursor errors and concealed storage failures. Web coverage is `apps/web/tests/posts/ProfilePosts.test.tsx` and the profile page test. Flutter coverage is `post_client_test.dart` and `profile_posts_test.dart`.
