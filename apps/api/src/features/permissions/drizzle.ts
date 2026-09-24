import { and, desc, eq, lte, not, or, sql } from "drizzle-orm";
import type { DayliDatabase } from "@dayli/db";
import { schema } from "@dayli/db";
import type { PermissionAction, ValidatedPublicLinkGrant, Viewer } from "./policy";

interface DrizzlePostVisibilityInputBase {
  viewer: Viewer;
  now: Date;
  /** This value is accepted only after #41 has validated the bearer token. */
  validatedPublicLinkGrant?: ValidatedPublicLinkGrant;
}

export type DrizzlePostVisibilityInput = DrizzlePostVisibilityInputBase & (
  | {
      action: "media";
      /** Required for a media-byte check; an old revision reference is not enough. */
      mediaId: string;
    }
  | {
      action?: Exclude<PermissionAction, "media">;
      mediaId?: never;
    }
);

export interface VisiblePostPage {
  limit: number;
  offset?: number;
}

function activeFriendship(authorId: typeof schema.posts.authorId, viewerId: string) {
  // #73 persists an active friendship in both directions. Requiring both rows
  // avoids treating a stale or partially-written directional projection as a
  // grant.
  const authorToViewer = sql`exists (
    select 1 from ${schema.friendships}
      where ${schema.friendships.userId} = ${authorId}
        and ${schema.friendships.friendId} = ${viewerId}
        and ${schema.friendships.state} = 'active'
  )`;
  const viewerToAuthor = sql`exists (
    select 1 from ${schema.friendships}
      where ${schema.friendships.userId} = ${viewerId}
        and ${schema.friendships.friendId} = ${authorId}
        and ${schema.friendships.state} = 'active'
  )`;
  return and(authorToViewer, viewerToAuthor);
}

function activeBlock(authorId: typeof schema.posts.authorId, viewerId: string) {
  return sql`exists (
    select 1 from ${schema.relationshipBlocks}
      where ${schema.relationshipBlocks.unblockedAt} is null
        and ((${schema.relationshipBlocks.blockerId} = ${authorId}
          and ${schema.relationshipBlocks.blockedId} = ${viewerId})
          or (${schema.relationshipBlocks.blockerId} = ${viewerId}
          and ${schema.relationshipBlocks.blockedId} = ${authorId}))
  )`;
}

function attachedMedia(postId: typeof schema.posts.id, mediaId?: string) {
  return sql`exists (
    select 1 from ${schema.postMedia}
      where ${schema.postMedia.postId} = ${postId}
        and ${schema.postMedia.detachedAt} is null
        and ${schema.postMedia.id} = ${mediaId}
  )`;
}

/**
 * Concrete PostgreSQL predicate for both list and detail queries.
 *
 * Callers must put this predicate in `where()` before applying pagination.
 * Correlated EXISTS clauses deliberately keep relationship rows from
 * multiplying posts in a list result.
 */
export function buildDrizzlePostVisibilityFilter(input: DrizzlePostVisibilityInput) {
  const { posts, user } = schema;
  const viewerId = input.viewer.userId ?? null;
  const owner = viewerId === null ? sql`false` : eq(posts.authorId, viewerId);
  const released = lte(posts.releasedAt, input.now);
  const friends = viewerId === null
    ? sql`false`
    : and(
      eq(posts.audience, "friends"),
      activeFriendship(posts.authorId, viewerId),
      not(activeBlock(posts.authorId, viewerId)),
    );

  const grant = input.validatedPublicLinkGrant;
  const publicLink = grant?.active === true && grant.postId.length > 0
    ? and(
      eq(posts.id, grant.postId),
      eq(posts.audience, "friends"),
      eq(user.profileVisibility, "public"),
    )
    : sql`false`;

  const access = input.action === "export"
    ? owner
    : or(owner, and(released, or(friends, publicLink)));
  const notBlocked = viewerId === null
    ? sql`true`
    : not(activeBlock(posts.authorId, viewerId));
  const media = input.action === "media"
    ? attachedMedia(posts.id, input.mediaId)
    : sql`true`;

  return and(media, notBlocked, access);
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
    .where(buildDrizzlePostVisibilityFilter(input))
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
    .where(and(eq(schema.posts.id, postId), buildDrizzlePostVisibilityFilter(input)))
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
      buildDrizzlePostVisibilityFilter({ ...input, action: "revision" }),
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

/** Media authorization is tied to a live post_media row, never revision metadata. */
export async function findVisiblePostMedia(
  database: DayliDatabase,
  postId: string,
  mediaId: string,
  input: Omit<DrizzlePostVisibilityInput, "action" | "mediaId">,
) {
  const [row] = await database
    .select({ media: schema.postMedia, post: schema.posts })
    .from(schema.postMedia)
    .innerJoin(schema.posts, eq(schema.postMedia.postId, schema.posts.id))
    .innerJoin(schema.user, eq(schema.posts.authorId, schema.user.id))
    .where(and(
      eq(schema.postMedia.postId, postId),
      eq(schema.postMedia.id, mediaId),
      buildDrizzlePostVisibilityFilter({ ...input, action: "media", mediaId }),
    ))
    .limit(1);
  return row ?? null;
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
    .select()
    .from(schema.tomorrowNotes)
    .where(and(
      eq(schema.tomorrowNotes.id, noteId),
      buildTomorrowNoteVisibilityFilter(viewer, currentAucklandDate),
    ))
    .limit(1);
  return row ?? null;
}
