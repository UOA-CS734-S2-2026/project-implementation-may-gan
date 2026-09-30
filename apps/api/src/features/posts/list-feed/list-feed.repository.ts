import { aucklandDateSchema } from "@dayli/contracts";
import { and, desc, eq, exists, isNotNull, ne, sql } from "drizzle-orm";
import { schema, type DayliDatabase, type HyperdriveBinding } from "@dayli/db";
import { withHyperdriveDatabase } from "../../../infrastructure/database/hyperdrive";
import { buildDrizzlePostVisibilityFilter } from "../../permissions";
import type { FeedPage, FeedPost } from "./list-feed.contract";

export interface FeedRepository {
  listFeed(viewerId: string, now: Date, limit: number, cursor?: string): Promise<FeedPage>;
}

/** A cursor the client altered or kept from another endpoint. */
export class InvalidFeedCursorError extends Error {
  constructor() {
    super("The feed cursor is not valid.");
    this.name = "InvalidFeedCursorError";
  }
}

interface FeedCursor {
  localDate: string;
  id: string;
}

/**
 * A calendar day PostgreSQL can cast, not just the `YYYY-MM-DD` shape, so a
 * forged cursor such as `2026-99-99` is a 422 rather than a failed query.
 * PostgreSQL has no year zero.
 */
function isLocalDate(value: unknown): value is string {
  return typeof value === "string" && aucklandDateSchema.safeParse(value).success && value >= "0001-01-01";
}

function encodeCursor(cursor: FeedCursor): string {
  return btoa(JSON.stringify([cursor.localDate, cursor.id]))
    .replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function decodeCursor(value: string | undefined): FeedCursor | undefined {
  if (!value) return undefined;
  try {
    const base64 = value.replaceAll("-", "+").replaceAll("_", "/");
    const parsed: unknown = JSON.parse(atob(base64 + "=".repeat((4 - base64.length % 4) % 4)));
    if (
      Array.isArray(parsed) && parsed.length === 2
      && isLocalDate(parsed[0])
      && typeof parsed[1] === "string" && parsed[1].length > 0
    ) {
      return { localDate: parsed[0], id: parsed[1] };
    }
  } catch {
    // Fall through to the stable validation error.
  }
  throw new InvalidFeedCursorError();
}

/**
 * Lists released `friends` posts by the viewer's active, unblocked friends,
 * newest Auckland day first. Visibility comes from the shared permission
 * predicate and is applied before the keyset limit, so a hidden post can never
 * leave a hole in, or leak into, a page. `(local_date, id)` is immutable, so an
 * unchanged post is never repeated or skipped between pages.
 */
export function createPostgresFeedRepository(database: DayliDatabase): FeedRepository {
  const { posts, user, dailyPrompts, postRevisions } = schema;
  return {
    async listFeed(viewerId, now, limit, rawCursor) {
      const cursor = decodeCursor(rawCursor);
      const rows = await database
        .select({
          id: posts.id,
          authorId: posts.authorId,
          username: user.username,
          displayName: sql<string>`coalesce(${user.displayUsername}, ${user.username})`,
          localDate: posts.localDate,
          promptId: posts.promptId,
          promptText: dailyPrompts.text,
          reflectiveAnswer: posts.reflectiveAnswer,
          caption: posts.caption,
          rating: posts.rating,
          acceptedAt: posts.acceptedAt,
          releasedAt: posts.releasedAt,
          edited: exists(
            database
              .select({ revisionId: postRevisions.id })
              .from(postRevisions)
              .where(eq(postRevisions.postId, posts.id)),
          ).mapWith(Boolean),
        })
        .from(posts)
        .innerJoin(user, eq(posts.authorId, user.id))
        .innerJoin(dailyPrompts, eq(posts.promptId, dailyPrompts.id))
        .where(and(
          buildDrizzlePostVisibilityFilter({ viewer: { userId: viewerId }, now, action: "list" }),
          // The owner branch of the shared predicate is for profiles; the feed
          // is friends only, which also keeps solo posts out.
          ne(posts.authorId, viewerId),
          eq(posts.audience, "friends"),
          isNotNull(user.username),
          cursor
            ? sql`(${posts.localDate}, ${posts.id}) < (${cursor.localDate}::date, ${cursor.id})`
            : undefined,
        ))
        .orderBy(desc(posts.localDate), desc(posts.id))
        .limit(limit + 1);

      const hasMore = rows.length > limit;
      const page = rows.slice(0, limit);
      const last = page.at(-1);
      return {
        items: page.map((row): FeedPost => ({
          id: row.id,
          author: { id: row.authorId, username: row.username!, displayName: row.displayName },
          localDate: row.localDate,
          prompt: { id: row.promptId, text: row.promptText },
          reflectiveAnswer: row.reflectiveAnswer,
          caption: row.caption,
          rating: row.rating,
          audience: "friends",
          acceptedAt: row.acceptedAt.toISOString(),
          releasedAt: row.releasedAt.toISOString(),
          edited: row.edited,
        })),
        hasMore,
        nextCursor: hasMore && last ? encodeCursor({ localDate: last.localDate, id: last.id }) : null,
      };
    },
  };
}

/** Workers close the request-scoped Hyperdrive client after each page. */
export function createHyperdriveFeedRepository(hyperdrive: HyperdriveBinding): FeedRepository {
  return {
    listFeed: (viewerId, now, limit, cursor) => withHyperdriveDatabase(hyperdrive, (database) => (
      createPostgresFeedRepository(database).listFeed(viewerId, now, limit, cursor)
    )),
  };
}
