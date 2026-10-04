import { schema } from "@dayli/db";
import { and, eq, exists, or } from "drizzle-orm";
import { QueryBuilder } from "drizzle-orm/pg-core";

/**
 * True when the viewer can see that the post was edited. The author sees every
 * edit. Anyone else sees only versions that were already shared with friends,
 * so an edit made while the post was solo never reaches them. A signed-out
 * viewer is never the author.
 */
export function postEdited(viewerId: string | null) {
  const { posts, postRevisions } = schema;
  return exists(
    new QueryBuilder()
      .select({ id: postRevisions.id })
      .from(postRevisions)
      .where(and(
        eq(postRevisions.postId, posts.id),
        viewerId === null
          ? eq(postRevisions.previousAudience, "friends")
          : or(eq(posts.authorId, viewerId), eq(postRevisions.previousAudience, "friends")),
      )),
  ).mapWith(Boolean);
}
