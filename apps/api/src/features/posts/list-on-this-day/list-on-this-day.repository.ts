import { and, desc, eq, inArray, lte } from "drizzle-orm";
import { schema, type DayliDatabase, type HyperdriveBinding } from "@dayli/db";
import type { AucklandDate } from "@dayli/domain";
import { withHyperdriveDatabase } from "../../../infrastructure/database/hyperdrive";
import { buildDrizzlePostVisibilityFilter } from "../../permissions";
import { postEdited } from "../shared/post-edited";
import { readAttachedMedia, type PostMediaRef } from "../shared/post-media";
import type { OnThisDayMemory } from "./list-on-this-day.contract";
import { onThisDayCandidates } from "./on-this-day-dates";

/** A memory with its media not yet signed; the route signs it for the response. */
export type OnThisDayMemoryRecord = Omit<OnThisDayMemory, "media"> & { media: PostMediaRef[] };

export interface OnThisDayRepository {
  /**
   * The owner's own posts from `today`'s Auckland month and day in earlier
   * years, newest first. `today` and `now` come from the server clock.
   */
  listOnThisDay(ownerId: string, today: AucklandDate, now: Date): Promise<OnThisDayMemoryRecord[]>;
}

/**
 * Reads the owner's memories through the shared visibility predicate, so a
 * post in Trash, awaiting purge, or belonging to a deleted account never
 * appears. Only the owner's posts are read: the author is the viewer.
 *
 * The query asks for exact `(author_id, local_date)` pairs, one date per
 * earlier year, rather than extracting the month and day from every row. That
 * is the shape of the partial unique index `posts_author_local_date_active_unique`
 * (author and day, rows not in Trash), so it reads a handful of index entries
 * however long the author's history is. The index allows one active post per
 * author and day, so the page holds at most one memory per year and needs no
 * cursor.
 */
export function createPostgresOnThisDayRepository(database: DayliDatabase): OnThisDayRepository {
  const { posts, dailyPrompts } = schema;
  return {
    async listOnThisDay(ownerId, today, now) {
      const candidates = onThisDayCandidates(today);
      if (candidates.length === 0) return [];
      const yearsAgoByDate = new Map(candidates.map((candidate) => [candidate.localDate as string, candidate.yearsAgo]));

      const rows = await database
        .select({
          id: posts.id,
          localDate: posts.localDate,
          promptId: posts.promptId,
          promptText: dailyPrompts.text,
          reflectiveAnswer: posts.reflectiveAnswer,
          caption: posts.caption,
          rating: posts.rating,
          audience: posts.audience,
          edited: postEdited(),
        })
        .from(posts)
        .innerJoin(dailyPrompts, eq(posts.promptId, dailyPrompts.id))
        .where(and(
          eq(posts.authorId, ownerId),
          inArray(posts.localDate, candidates.map((candidate) => candidate.localDate)),
          lte(posts.releasedAt, now),
          buildDrizzlePostVisibilityFilter(database, { viewer: { userId: ownerId }, now, action: "list" }),
        ))
        .orderBy(desc(posts.localDate), desc(posts.id))
        .limit(candidates.length);

      const media = await readAttachedMedia(database, rows.map((row) => row.id));
      return rows.map((row): OnThisDayMemoryRecord => ({
        id: row.id,
        localDate: row.localDate as AucklandDate,
        yearsAgo: yearsAgoByDate.get(row.localDate)!,
        rating: row.rating,
        audience: row.audience,
        prompt: { id: row.promptId, text: row.promptText },
        reflectiveAnswer: row.reflectiveAnswer,
        caption: row.caption,
        edited: row.edited,
        media: media.get(row.id) ?? [],
      }));
    },
  };
}

/** Workers close the request-scoped Hyperdrive client after each read. */
export function createHyperdriveOnThisDayRepository(hyperdrive: HyperdriveBinding): OnThisDayRepository {
  return {
    listOnThisDay: (ownerId, today, now) => withHyperdriveDatabase(hyperdrive, (database) => (
      createPostgresOnThisDayRepository(database).listOnThisDay(ownerId, today, now)
    )),
  };
}
