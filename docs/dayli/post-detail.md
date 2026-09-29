# Post detail

`GET /api/v1/posts/{postId}` returns one post the caller may read.

## Who can read a post

- The author can read their own posts, including solo posts and posts before release.
- Anyone else needs a released `friends` post by an active friend, with no block in either direction.

Visibility comes from `buildDrizzlePostVisibilityFilter` with the `detail` action, the same predicate the [friends feed](friends-feed.md) uses. A post that does not exist and a post the caller may not read both return `404 NOT_FOUND`, so the response never confirms that a hidden post exists. Responses are `Cache-Control: no-store`.

## Projection

The response has the post ID, author (`id`, `username`, `displayName`), Auckland `localDate`, the prompt stored with the post (not the current day's prompt), reflective answer, caption, rating, audience, `acceptedAt`, `releasedAt`, `edited`, and `viewerIsAuthor`. Tomorrow notes are never included. Media, and like and comment counts, are left out until download authorisation (#24) and interactions (#79) exist. They will be added as optional fields.

## Tests

`get-post.route.test.ts` covers authentication, 404 concealment, ID validation, and concealed storage failures, and checks that the detail route does not add a second session check to `POST /api/v1/posts`. `get-post.repository.integration.test.ts` runs through the restricted `app` role. It covers the author's solo and unreleased posts, a friend's read, the stored prompt and edited marker, release at midnight, and concealment from strangers, ended friendships, blocks, solo posts, unreleased posts, and unknown IDs.
