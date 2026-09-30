# Post detail

`GET /api/v1/posts/{postId}` returns one post the caller may read.

## Who can read a post

- The author can read their own posts, including solo posts and posts before release.
- Anyone else needs a released `friends` post by an active friend, with no block in either direction.

Visibility comes from `buildDrizzlePostVisibilityFilter` with the `detail` action, the same predicate the [friends feed](friends-feed.md) uses. A post that does not exist and a post the caller may not read both return `404 NOT_FOUND`, so the response never confirms that a hidden post exists. Responses are `Cache-Control: no-store`.

## Projection

The response has the post ID, author (`id`, `username`, `displayName`), Auckland `localDate`, the prompt stored with the post (not the current day's prompt), reflective answer, caption, rating, audience, `acceptedAt`, `releasedAt`, `edited`, and `viewerIsAuthor`. Tomorrow notes are never included. Media, and like and comment counts, are left out until download authorisation (#24) and interactions (#79) exist. They will be added as optional fields.

## Clients

Web opens `/u/{username}/{postId}` from the whole feed card. Existing `/{username}/{postId}` links redirect to that address. It reads the post with an account-keyed query and replaces a link whose username is stale or cased differently with the author's current address. Flutter opens `/posts/{id}` as a full-screen page when a feed card is tapped. Both show one "isn't available" message for a missing or hidden post, a retry for other failures, and the audience and edited marker to the author. Flutter reads the post again on every open and pull-to-refresh, so a post that was deleted or whose access was revoked is removed rather than shown from memory. The Flutter client decodes the body itself because the generated Dart `PostDetail` treats the nullable `caption` as required.

## Tests

`get-post.route.test.ts` covers authentication, 404 concealment, ID validation, and concealed storage failures, and checks that the detail route does not add a second session check to `POST /api/v1/posts`. `get-post.repository.integration.test.ts` runs through the restricted `app` role. It covers the author's solo and unreleased posts, a friend's read, the stored prompt and edited marker, release at midnight, and concealment from strangers, ended friendships, blocks, solo posts, unreleased posts, and unknown IDs. Web coverage is `apps/web/tests/posts/PostDetailView.test.tsx`. Flutter coverage is `post_client_test.dart` and `post_detail_test.dart`.
