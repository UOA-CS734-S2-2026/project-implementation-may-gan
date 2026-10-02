import { and, eq, isNotNull, sql } from "drizzle-orm";
import { schema, type DayliDatabase } from "@dayli/db";
import type { PostComment } from "./interactions.contract";

type Queryable = Pick<DayliDatabase, "select">;

/** The columns every comment response is built from. */
export function commentColumns() {
  const { postComments, user } = schema;
  return {
    id: postComments.id,
    postId: postComments.postId,
    parentCommentId: postComments.parentCommentId,
    authorId: postComments.authorId,
    username: user.username,
    displayName: sql<string>`coalesce(${user.displayUsername}, ${user.username})`,
    text: postComments.body,
    createdAt: postComments.createdAt,
    editedAt: postComments.editedAt,
  };
}

export interface CommentRow {
  id: string;
  postId: string;
  parentCommentId: string | null;
  authorId: string;
  username: string | null;
  displayName: string;
  text: string;
  createdAt: Date;
  editedAt: Date | null;
}

/** The commenter may edit and delete; the post's author may delete. */
export function toPostComment(row: CommentRow, viewerId: string, postAuthorId: string): PostComment {
  return {
    id: row.id,
    postId: row.postId,
    parentCommentId: row.parentCommentId,
    author: { id: row.authorId, username: row.username ?? "", displayName: row.displayName },
    text: row.text,
    createdAt: row.createdAt.toISOString(),
    editedAt: row.editedAt?.toISOString() ?? null,
    viewerCanEdit: row.authorId === viewerId,
    viewerCanDelete: row.authorId === viewerId || postAuthorId === viewerId,
  };
}

/** One live comment by ID, read back after a write. */
export async function readComment(database: Queryable, commentId: string): Promise<CommentRow | null> {
  const { postComments, user } = schema;
  const [row] = await database
    .select(commentColumns())
    .from(postComments)
    .innerJoin(user, eq(postComments.authorId, user.id))
    .where(and(eq(postComments.id, commentId), isNotNull(user.username)))
    .limit(1);
  return row ?? null;
}
