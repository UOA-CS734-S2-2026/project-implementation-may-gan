import { and, eq, isNotNull } from "drizzle-orm";
import { schema, type DayliDatabase } from "@dayli/db";
import { buildDrizzlePostVisibilityFilter } from "../../permissions";

type Queryable = Pick<DayliDatabase, "select">;

/**
 * The post's author when the viewer may read the post now, or null. Every
 * interaction read and write starts here, so likes and comments follow the
 * post's visibility exactly: solo, unreleased, deleted, blocked, and
 * unfriended posts can't be liked, commented on, or listed. It keeps the
 * friend scope of the feed rather than the detail read's public-profile
 * access, so a stranger who can read a public account's post still can't like
 * or comment on it. It also needs an author with a username, like the detail
 * read, so a post that returns 404 there has no likes or comments to reach.
 */
export async function findReadablePost(
  database: Queryable,
  viewerId: string,
  postId: string,
  now: Date,
): Promise<{ authorId: string } | null> {
  const { posts, user } = schema;
  const [post] = await database
    .select({ authorId: posts.authorId })
    .from(posts)
    .innerJoin(user, eq(posts.authorId, user.id))
    .where(and(
      eq(posts.id, postId),
      buildDrizzlePostVisibilityFilter(database, { viewer: { userId: viewerId }, now, action: "preview" }),
      isNotNull(user.username),
    ))
    .limit(1);
  return post ?? null;
}
