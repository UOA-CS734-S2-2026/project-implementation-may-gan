import { and, desc, eq, lt } from "drizzle-orm";
import { schema, type DayliDatabase, type HyperdriveBinding } from "@dayli/db";
import { withHyperdriveDatabase } from "../../../infrastructure/database/hyperdrive";
import { buildDrizzlePostVisibilityFilter } from "../../permissions";
import { visibleRevisions } from "../shared/post-revisions";
import type { PostRevisionsPage } from "./list-post-revisions.contract";

/** A cursor the client altered or kept from another endpoint. */
export class InvalidRevisionCursorError extends Error {
  constructor() {
    super("The page cursor is not valid.");
    this.name = "InvalidRevisionCursorError";
  }
}

function encodeRevisionCursor(revisionNumber: number): string {
  return btoa(JSON.stringify(["revision", revisionNumber]))
    .replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

/** Decoded before any query, so a bad cursor never reaches PostgreSQL. */
function decodeRevisionCursor(value: string | undefined): number | undefined {
  if (!value) return undefined;
  try {
    const base64 = value.replaceAll("-", "+").replaceAll("_", "/");
    const parsed: unknown = JSON.parse(atob(base64 + "=".repeat((4 - base64.length % 4) % 4)));
    if (Array.isArray(parsed) && parsed.length === 2 && parsed[0] === "revision"
      && Number.isSafeInteger(parsed[1]) && parsed[1] > 1) {
      return parsed[1];
    }
  } catch {
    // Fall through to the stable validation error.
  }
  throw new InvalidRevisionCursorError();
}

export interface PostRevisionsRepository {
  /** Null when the post is absent or the viewer may not read it. */
  listRevisions(viewerId: string, postId: string, now: Date, limit: number, cursor?: string): Promise<PostRevisionsPage | null>;
}

/**
 * Lists earlier versions, newest first. Access follows the current post, so
 * history disappears with the post, a block, or an ended friendship. Anyone but
 * the author sees only versions that were already shared with friends.
 */
export function createPostgresPostRevisionsRepository(database: DayliDatabase): PostRevisionsRepository {
  const { posts, postRevisions } = schema;
  return {
    async listRevisions(viewerId, postId, now, limit, rawCursor) {
      const before = decodeRevisionCursor(rawCursor);
      const [post] = await database
        .select({ authorId: posts.authorId })
        .from(posts)
        .where(and(
          eq(posts.id, postId),
          buildDrizzlePostVisibilityFilter(database, { viewer: { userId: viewerId }, now, action: "revision" }),
        ))
        .limit(1);
      if (!post) return null;

      const rows = await database
        .select({
          revisionNumber: postRevisions.revisionNumber,
          reflectiveAnswer: postRevisions.previousReflectiveAnswer,
          caption: postRevisions.previousCaption,
          rating: postRevisions.previousRating,
          audience: postRevisions.previousAudience,
          replacedAt: postRevisions.createdAt,
        })
        .from(postRevisions)
        .where(and(
          visibleRevisions(postId, post.authorId === viewerId),
          before === undefined ? undefined : lt(postRevisions.revisionNumber, before),
        ))
        .orderBy(desc(postRevisions.revisionNumber))
        .limit(limit + 1);

      const hasMore = rows.length > limit;
      const items = rows.slice(0, limit).map((row) => ({ ...row, replacedAt: row.replacedAt.toISOString() }));
      const last = items.at(-1);
      return {
        items,
        nextCursor: hasMore && last ? encodeRevisionCursor(last.revisionNumber) : null,
        hasMore,
      };
    },
  };
}

/** Workers close the request-scoped Hyperdrive client after each read. */
export function createHyperdrivePostRevisionsRepository(hyperdrive: HyperdriveBinding): PostRevisionsRepository {
  return {
    listRevisions: (viewerId, postId, now, limit, cursor) => withHyperdriveDatabase(hyperdrive, (database) => (
      createPostgresPostRevisionsRepository(database).listRevisions(viewerId, postId, now, limit, cursor)
    )),
  };
}
