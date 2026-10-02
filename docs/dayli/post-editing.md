# Editing and deleting posts

Authors can edit and delete their own posts. Every edit keeps the previous version, and friends can read earlier versions that were shared with them. The rules are recorded in [Product decisions](product-decisions.md#editing-and-deleting-posts).

## Editing

`PATCH /api/v1/posts/{postId}` changes the reflective answer, caption, rating, or audience. It works before and after release. The prompt, day, media, and tomorrow note can't be edited. Fields left out stay as they are, and `"caption": null` removes the caption.

The request carries `expectedRevisionCount`, the `revisionCount` the author last read from post detail. The repository locks the post row, so concurrent edits queue:

- If nothing would change, the post is returned as it is, with no new revision. This is how a retry of a saved edit ends, so retries never duplicate revisions.
- If another edit was saved since the author read the post, the response is `409 CONFLICT`. The client reads the post again and reapplies the change.
- Otherwise the previous version is inserted into `post_revisions` and the post is updated in one transaction. The response is the post in the same shape as `GET /api/v1/posts/{postId}`.

Someone else's post, a deleted post, and an unknown ID all return `404 NOT_FOUND`.

The generated Dart `UpdatePostRequest` writes every left-out field as `null`. That would fail validation for the answer, rating, and audience, and would clear the caption. Clients send all four fields; the server only stores a revision when a value actually changes.

## Revision history

`GET /api/v1/posts/{postId}/revisions` lists earlier versions, newest first, with cursor pagination. Access follows the current post through the shared `revision` visibility action, so history disappears with the post, a block, or an ended friendship.

The author sees every version. Anyone else sees only versions whose audience was `friends`, so text written while the post was solo never reaches friends after the author shares it. Post detail, the feed, and profile posts use the same rule for `edited` and `revisionCount`: friends don't see an "Edited" marker for edits they can't read.

## Deleting

`DELETE /api/v1/posts/{postId}` returns `204` and sets `posts.deleted_at`. The shared visibility filter excludes deleted posts for everyone, the author included, so the post disappears from detail, feed, profile posts, revisions, and media downloads. Streaks and post counts ignore it. Deleting again returns `204` and keeps the first deletion time. Someone else's post or an unknown ID returns `404`.

One post per author per day is enforced by the partial unique index `posts_author_local_date_live_unique`, which ignores deleted posts. After deleting, the author can post again while that Auckland day is still open. `POST /api/v1/posts` accepts only the current day, so a past day is never reposted.

Rows, revisions, and media stay in the database and R2 after deletion. A seven-day Trash with restore, and the job that purges deleted posts and their media, belong to #163. A restore will have to refuse when the author has already posted again that day.

Retrying a post-creation request with the idempotency key of a post that was later deleted replays the original outcome, the deleted post. Clients use a new key for each submission, so this only affects a retry of the original request.

## Tests

The route tests in `update-post/`, `delete-post/`, and `list-post-revisions/` cover authentication, validation, 404 concealment, conflicts, and concealed storage failures. The `*.repository.integration.test.ts` files run through the restricted `app` role. They cover revision storage, retries, stale and concurrent edits, deletion visibility for author and friends, reposting after deletion, solo-era revisions hidden from friends, pagination, blocks, and history after deletion. `profile-details.repository.integration.test.ts` checks that a deleted post neither counts as a post nor fills a streak gap.
