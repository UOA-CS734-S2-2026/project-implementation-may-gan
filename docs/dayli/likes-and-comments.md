# Likes and comments

Anyone who can read a post can like it and comment on it, including its author. The rules are recorded in [Product decisions](product-decisions.md#likes-and-comments). The routes live in `apps/api/src/features/interactions`.

## Access

Every read and write starts with `findReadablePost`, which uses the shared `detail` visibility predicate. Likes and comments therefore follow the post exactly: solo posts are the author's alone, unreleased posts open at midnight, and deleted, blocked, and unfriended posts return `404 NOT_FOUND` for every interaction route, including edits and deletes. The check runs on every request, so lost access takes effect immediately.

Likes and comments show a public username, so every interaction route also uses `createRequireUsername`, the same check as messaging. Someone still choosing a username gets `403 FORBIDDEN`. Comments by an account without a username are left out of lists and counts.

## Likes

- `PUT /api/v1/posts/{postId}/like` likes the post. `DELETE` on the same path unlikes it. Both return `{ likeCount, viewerHasLiked }`, and repeating either changes nothing, so retries are safe. `post_likes` has one row per person per post.
- `GET /api/v1/posts/{postId}/likes` lists who liked the post, newest first, with cursor pagination. People across a block from the viewer, in either direction, are left out of the list. `likeCount` counts every like.

## Comments

- `GET /api/v1/posts/{postId}/comments` lists comments and replies in the order they were written, by `(created_at, id)`. A reply always comes after its top-level comment, so clients group replies under it as pages arrive. Deleted comments, replies under a deleted comment, and comments by people across a block from the viewer are left out, along with replies under a comment that is hidden that way. Each comment carries `viewerCanEdit` and `viewerCanDelete`.
- `POST /api/v1/posts/{postId}/comments` adds a comment, or a reply when `parentCommentId` names a visible top-level comment on the same post. Replies go one level deep; the composite key `post_comments_parent_same_post_fk` keeps a reply on its parent's post. The body is 1–1000 trimmed characters. `clientCommentId` makes a retry return the comment already made with `200`; reusing it for different text, parent, or post is `409`. If two retries race, the second attempt replays the first.
- `PATCH /api/v1/posts/{postId}/comments/{commentId}` lets the commenter change the text. The comment gets an `editedAt` time; saving the same text again changes nothing.
- `DELETE /api/v1/posts/{postId}/comments/{commentId}` lets the commenter or the post's author delete a comment, which sets `deleted_at` and `deleted_by`. Deleting a top-level comment hides its replies. Deleting again returns `204`.

## Post detail

`GET /api/v1/posts/{postId}` adds `likeCount`, `viewerHasLiked`, and `commentCount`. `commentCount` uses the same rule as the comment list (`buildDrizzleCommentVisibilityFilter` in `permissions`), so it matches what the viewer can open. The feed and profile cards don't show counts yet.

## Deletion and retention

Deleting a post hides its likes and comments because every route checks the post first. Like the post itself, they stay in the database until #163 purges deleted posts. Account deletion (#161) will need to remove or detach a deleted account's likes and comments; their foreign keys use `NO ACTION`, like the other user references.

## Tests

Route tests sit beside each action. The `*.repository.integration.test.ts` files run through the restricted `app` role with the fixture in `apps/api/test/support/interactions/interaction-fixtures.ts`. They cover idempotent and concurrent likes, refusals for strangers, blocks, solo, unreleased, and deleted posts, liker and comment ordering and paging, block filtering in both directions, deleted threads, retries, reused and racing client IDs, one-level replies, edits by the commenter only, and moderation by the post's author.
