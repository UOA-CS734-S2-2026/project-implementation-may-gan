import { and, desc, eq, exists, isNotNull, isNull, lte, ne, not, notExists, or, sql, type AnyColumn, type SQLWrapper } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { DayliDatabase } from "@dayli/db";
import { schema } from "@dayli/db";
import type { PermissionAction, Viewer } from "./policy";

interface DrizzlePostVisibilityInputBase {
  viewer: Viewer;
  now: Date;
}

export type DrizzlePostVisibilityInput = DrizzlePostVisibilityInputBase & (
  | {
      action: "media" | "private-media";
      /** Required for a media-byte check; an old revision reference is not enough. */
      mediaId: string;
    }
  | {
      action?: Exclude<PermissionAction, "media" | "private-media">;
      mediaId?: never;
    }
);

export interface VisiblePostPage {
  limit: number;
  offset?: number;
}

type Queryable = Pick<DayliDatabase, "select">;

/** Missing lifecycle rows are active. A pending or terminal owner is hidden before pagination. */
export function buildDrizzleActiveAccountFilter(database: Queryable, subjectId: string | SQLWrapper) {
  return notExists(database.select({ userId: schema.accountLifecycles.userId })
    .from(schema.accountLifecycles)
    .where(and(
      eq(schema.accountLifecycles.userId, subjectId),
      ne(schema.accountLifecycles.state, "active"),
    )));
}

function activeFriendship(
  database: Queryable,
  authorId: typeof schema.posts.authorId,
  viewerId: string | SQLWrapper,
) {
  // #73 persists an active friendship in both directions. Requiring both rows
  // avoids treating a stale or partially-written directional projection as a
  // grant.
  const authorToViewer = exists(
    database
      .select({ friendId: schema.friendships.friendId })
      .from(schema.friendships)
      .where(and(
        eq(schema.friendships.userId, authorId),
        eq(schema.friendships.friendId, viewerId),
        eq(schema.friendships.state, "active"),
      )),
  );
  const viewerToAuthor = exists(
    database
      .select({ friendId: schema.friendships.friendId })
      .from(schema.friendships)
      .where(and(
        eq(schema.friendships.userId, viewerId),
        eq(schema.friendships.friendId, authorId),
        eq(schema.friendships.state, "active"),
      )),
  );
  return and(authorToViewer, viewerToAuthor);
}

function activeBlock(
  database: Queryable,
  authorId: typeof schema.posts.authorId,
  viewerId: string | SQLWrapper,
) {
  return exists(
    database
      .select({ blockerId: schema.relationshipBlocks.blockerId })
      .from(schema.relationshipBlocks)
      .where(and(
        isNull(schema.relationshipBlocks.unblockedAt),
        or(
          and(
            eq(schema.relationshipBlocks.blockerId, authorId),
            eq(schema.relationshipBlocks.blockedId, viewerId),
          ),
          and(
            eq(schema.relationshipBlocks.blockerId, viewerId),
            eq(schema.relationshipBlocks.blockedId, authorId),
          ),
        ),
      )),
  );
}

function attachedMedia(
  database: Queryable,
  postId: typeof schema.posts.id,
  mediaId: string,
) {
  return exists(
    database
      .select({ id: schema.postMedia.id })
      .from(schema.postMedia)
      .where(and(
        eq(schema.postMedia.postId, postId),
        isNull(schema.postMedia.detachedAt),
        eq(schema.postMedia.id, mediaId),
      )),
  );
}

/**
 * Concrete PostgreSQL predicate for both list and detail queries.
 *
 * Callers must put this predicate in `where()` before applying pagination.
 * Correlated EXISTS clauses deliberately keep relationship rows from
 * multiplying posts in a list result.
 */
export function buildDrizzlePostVisibilityFilter(
  database: Queryable,
  input: DrizzlePostVisibilityInput,
) {
  const { posts, user } = schema;
  const viewerId = input.viewer.userId ?? null;
  const owner = viewerId === null ? sql`false` : eq(posts.authorId, viewerId);
  const released = lte(posts.releasedAt, input.now);
  const friends = viewerId === null
    ? sql`false`
    : and(
      eq(posts.audience, "friends"),
      activeFriendship(database, posts.authorId, viewerId),
      not(activeBlock(database, posts.authorId, viewerId)),
    );

  // Public access is explicit for direct detail, profile archives, and the
  // parent-authorized byte route. Generic lists and legacy signed downloads
  // retain their friend scope.
  const publicProfile = input.action === "detail" || input.action === "profile" || input.action === "media"
    ? and(eq(posts.audience, "friends"), eq(user.profileVisibility, "public"))
    : sql`false`;

  const access = input.action === "export"
    ? owner
    : or(owner, and(released, or(friends, publicProfile)));
  const notBlocked = viewerId === null
    ? sql`true`
    : not(activeBlock(database, posts.authorId, viewerId));
  const media = input.action === "media" || input.action === "private-media"
    ? attachedMedia(database, posts.id, input.mediaId)
    : sql`true`;

  // Pending owners may still request their own export. Normal reads stay hidden.
  const activeAccount = input.action === "export"
    ? sql`true`
    : buildDrizzleActiveAccountFilter(database, posts.authorId);
  // Export uses a separate owner-scoped Trash projection for restorable items.
  // Normal post, media, revision, and active-export reads never include Trash.
  return and(isNull(posts.trashedAt), activeAccount, media, notBlocked, access);
}

/** Same friends-only release rules as the feed, also usable for correlated recipient queries. */
export function buildDrizzleFriendsReleaseFilter(database: Queryable, viewerId: string | SQLWrapper, localDate: string, now: Date) {
  return and(
    ne(schema.posts.authorId, viewerId), eq(schema.posts.localDate, localDate),
    eq(schema.posts.audience, "friends"), lte(schema.posts.releasedAt, now),
    isNull(schema.posts.trashedAt), isNotNull(schema.user.username),
    buildDrizzleActiveAccountFilter(database, schema.posts.authorId),
    activeFriendship(database, schema.posts.authorId, viewerId),
    not(activeBlock(database, schema.posts.authorId, viewerId)),
  );
}

/** List filtering is applied before limit/offset, preventing page holes/leaks. */
export async function listVisiblePosts(
  database: DayliDatabase,
  input: DrizzlePostVisibilityInput,
  page: VisiblePostPage,
) {
  const limit = Math.max(1, Math.floor(page.limit));
  const offset = Math.max(0, Math.floor(page.offset ?? 0));
  return database
    .select({ post: schema.posts })
    .from(schema.posts)
    .innerJoin(schema.user, eq(schema.posts.authorId, schema.user.id))
    .where(buildDrizzlePostVisibilityFilter(database, input))
    .orderBy(desc(schema.posts.localDate), desc(schema.posts.id))
    .limit(limit)
    .offset(offset);
}

/** Detail uses the exact same predicate as list, including media attachment. */
export async function findVisiblePost(
  database: DayliDatabase,
  postId: string,
  input: DrizzlePostVisibilityInput,
) {
  const [row] = await database
    .select({ post: schema.posts })
    .from(schema.posts)
    .innerJoin(schema.user, eq(schema.posts.authorId, schema.user.id))
    .where(and(eq(schema.posts.id, postId), buildDrizzlePostVisibilityFilter(database, input)))
    .limit(1);
  return row?.post ?? null;
}

/** Revision reads are authorised against the current post projection. */
export async function findVisiblePostRevision(
  database: DayliDatabase,
  revisionId: string,
  input: Omit<DrizzlePostVisibilityInput, "action" | "mediaId">,
) {
  const [row] = await database
    .select({ revision: schema.postRevisions, post: schema.posts })
    .from(schema.postRevisions)
    .innerJoin(schema.posts, eq(schema.postRevisions.postId, schema.posts.id))
    .innerJoin(schema.user, eq(schema.posts.authorId, schema.user.id))
    .where(and(
      eq(schema.postRevisions.id, revisionId),
      buildDrizzlePostVisibilityFilter(database, { ...input, action: "revision" }),
    ))
    .limit(1);
  return row ?? null;
}

/** Preview is the same current-post decision with a separately named entrypoint. */
export function findVisiblePostPreview(
  database: DayliDatabase,
  postId: string,
  input: Omit<DrizzlePostVisibilityInput, "action" | "mediaId">,
) {
  return findVisiblePost(database, postId, { ...input, action: "preview" });
}

/** Export remains owner-only and returns the current post projection. */
export function findVisiblePostExport(
  database: DayliDatabase,
  postId: string,
  input: Omit<DrizzlePostVisibilityInput, "action" | "mediaId">,
) {
  return findVisiblePost(database, postId, { ...input, action: "export" });
}

async function findPostMediaForAction(
  database: DayliDatabase,
  postId: string,
  mediaId: string,
  input: Omit<DrizzlePostVisibilityInput, "action" | "mediaId">,
  action: "media" | "private-media",
) {
  const [row] = await database
    .select({ media: schema.postMedia, post: schema.posts })
    .from(schema.postMedia)
    .innerJoin(schema.posts, eq(schema.postMedia.postId, schema.posts.id))
    .innerJoin(schema.user, eq(schema.posts.authorId, schema.user.id))
    .where(and(
      eq(schema.postMedia.postId, postId),
      eq(schema.postMedia.id, mediaId),
      buildDrizzlePostVisibilityFilter(database, { ...input, action, mediaId }),
    ))
    .limit(1);
  return row ?? null;
}

/** Media authorization is tied to a live post_media row, never revision metadata. */
export function findVisiblePostMedia(
  database: DayliDatabase,
  postId: string,
  mediaId: string,
  input: Omit<DrizzlePostVisibilityInput, "action" | "mediaId">,
) {
  return findPostMediaForAction(database, postId, mediaId, input, "media");
}

/** Existing signed downloads remain limited to owners and active friends. */
export function findPrivatelyVisiblePostMedia(
  database: DayliDatabase,
  postId: string,
  mediaId: string,
  input: Omit<DrizzlePostVisibilityInput, "action" | "mediaId">,
) {
  return findPostMediaForAction(database, postId, mediaId, input, "private-media");
}

/**
 * True when neither the viewer nor `userColumn`'s person has blocked the other.
 * Lists of likes and comments hide people across a block in either direction.
 */
export function notBlockedWith(database: Queryable, viewerId: string | null, userColumn: AnyColumn) {
  const { relationshipBlocks } = schema;
  if (viewerId === null) return sql`true`;
  return notExists(
    database
      .select({ blockerId: relationshipBlocks.blockerId })
      .from(relationshipBlocks)
      .where(and(
        isNull(relationshipBlocks.unblockedAt),
        or(
          and(eq(relationshipBlocks.blockerId, viewerId), eq(relationshipBlocks.blockedId, userColumn)),
          and(eq(relationshipBlocks.blockerId, userColumn), eq(relationshipBlocks.blockedId, viewerId)),
        ),
      )),
  );
}

/**
 * Comments the viewer sees on a post they can read: not deleted, written by
 * someone with a username who isn't across a block, and, for a reply, under a
 * top-level comment that is itself visible. Lists and counts share this rule.
 * Callers check the post first.
 */
export function buildDrizzleCommentVisibilityFilter(database: Queryable, viewerId: string | null) {
  const { postComments } = schema;
  const parent = alias(postComments, "parent_comment");
  return and(
    isNull(postComments.deletedAt),
    hasUsername(database, postComments.authorId),
    notBlockedWith(database, viewerId, postComments.authorId),
    or(
      isNull(postComments.parentCommentId),
      exists(
        database
          .select({ id: parent.id })
          .from(parent)
          .where(and(
            eq(parent.id, postComments.parentCommentId),
            isNull(parent.deletedAt),
            hasUsername(database, parent.authorId),
            notBlockedWith(database, viewerId, parent.authorId),
          )),
      ),
    ),
  );
}

/** Comments show a public username, so an author without one can't be shown. */
function hasUsername(database: Queryable, userColumn: AnyColumn) {
  return exists(
    database
      .select({ id: schema.user.id })
      .from(schema.user)
      .where(and(eq(schema.user.id, userColumn), isNotNull(schema.user.username))),
  );
}

/** Tomorrow notes are private and become readable only on the next Auckland day. */
export function buildTomorrowNoteVisibilityFilter(
  viewer: Viewer,
  currentAucklandDate: string,
) {
  return viewer.userId == null
    ? sql`false`
    : and(
      eq(schema.tomorrowNotes.authorId, viewer.userId),
      lte(schema.tomorrowNotes.availableOn, currentAucklandDate),
    );
}

export async function findVisibleTomorrowNote(
  database: DayliDatabase,
  noteId: string,
  viewer: Viewer,
  currentAucklandDate: string,
) {
  const [row] = await database
    .select({ note: schema.tomorrowNotes })
    .from(schema.tomorrowNotes)
    .innerJoin(schema.posts, eq(schema.tomorrowNotes.postId, schema.posts.id))
    .where(and(
      eq(schema.tomorrowNotes.id, noteId),
      isNull(schema.posts.trashedAt),
      buildTomorrowNoteVisibilityFilter(viewer, currentAucklandDate),
    ))
    .limit(1);
  return row?.note ?? null;
}
