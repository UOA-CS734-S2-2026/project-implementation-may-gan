# Editing and deleting posts

Authors can edit their own posts and move them to Trash. Every edit keeps the previous version, and friends can read earlier versions that were shared with them. The rules are recorded in [Product decisions](product-decisions.md#editing-and-deleting-posts).

## Editing

`PATCH /api/v1/posts/{postId}` changes the reflective answer, caption, rating, or audience. It works before and after release. The prompt, day, media, and tomorrow note can't be edited. The request always carries all four fields as the post should read afterwards, and `"caption": null` removes the caption. Only values that differ are saved.

The request carries `expectedRevisionCount`, the `revisionCount` the author last read from post detail. The repository locks the post row, so concurrent edits queue:

- If nothing would change, the post is returned as it is, with no new revision. This is how a retry of a saved edit ends, so retries never duplicate revisions.
- If another edit was saved since the author read the post, the response is `409 CONFLICT`. The client reads the post again and reapplies the change.
- Otherwise the previous version is inserted into `post_revisions` and the post is updated in one transaction. The response is the post in the same shape as `GET /api/v1/posts/{postId}`.

Someone else's post, a deleted post, and an unknown ID all return `404 NOT_FOUND`.

All four fields are required because the generated Dart client writes every unset field as `null`, so it can't express a partial update: a left-out caption would read as "remove the caption". With every field required, the generated `UpdatePostRequest` sends exactly what the author sees.

## Revision history

`GET /api/v1/posts/{postId}/revisions` lists earlier versions, newest first, with cursor pagination. Access follows the current post through the shared `revision` visibility action, so history disappears with the post, a block, or an ended friendship.

The author sees every version. Anyone else sees only versions whose audience was `friends`, so text written while the post was solo never reaches friends after the author shares it. Post detail, the feed, and profile posts use the same rule for `edited` and `revisionCount`: friends don't see an "Edited" marker for edits they can't read.

## Deleting

Deleting a post moves it to Trash, which belongs to the post Trash lifecycle (#250, #163): `POST /api/v1/posts/{postId}/trash` and `/restore`, listed by `GET /api/v1/posts/trash`. Those routes stay switched off until Trash is enabled for an environment, and until then they return `503`. A trashed post is hidden from detail, feed, profile posts, revisions, edits, likes, comments, and media, because the shared visibility filter excludes `posts.trashed_at`. Streaks and post counts ignore it, and the author can post again while that Auckland day is open. The author can restore it for 7 days, unless that day already has a newer post; cleanup removes it after 14.

Retrying a post-creation request with the idempotency key of a post now in Trash returns `409 CONFLICT` with `details.reason` `POST_TRASHED` and no post content. The key stays used, so the retry can't create a second post. Both composers then give the draft a new key, so posting the same words again creates a new post.

## Tests

The route tests in `update-post/` and `list-post-revisions/` cover authentication, validation, 404 concealment, conflicts, and concealed storage failures. The `*.repository.integration.test.ts` files run through the restricted `app` role. They cover revision storage, retries, stale and concurrent edits, solo-era revisions hidden from friends, pagination, blocks, and history and edits after a post moves to Trash. `create-post.repository.integration.test.ts` covers a retry after Trash, and `profile-details.repository.integration.test.ts` checks that a trashed post neither counts as a post nor fills a streak gap.
