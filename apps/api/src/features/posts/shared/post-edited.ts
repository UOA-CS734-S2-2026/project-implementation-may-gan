import { schema } from "@dayli/db";
import { eq, exists } from "drizzle-orm";
import { QueryBuilder } from "drizzle-orm/pg-core";

/** True when the author has edited the post since it was accepted. */
export function postEdited() {
  const { posts, postRevisions } = schema;
  return exists(
    new QueryBuilder()
      .select({ id: postRevisions.id })
      .from(postRevisions)
      .where(eq(postRevisions.postId, posts.id)),
  ).mapWith(Boolean);
}
