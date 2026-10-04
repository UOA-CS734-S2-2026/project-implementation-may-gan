import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import {
  classifyPostgresConstraintError,
  createHyperdriveDatabase,
  schema,
  sql,
  type DayliDatabase,
  type HyperdriveBinding,
} from "@dayli/db";
import { createDailyPromptRepository } from "../../../infrastructure/database/posting-day.repository";
import {
  CreateDailyPostError,
  type DailyPostAudience,
  type DailyPostStore,
  type DailyPostTransaction,
  type StoredDailyPost,
  type StoredPostMedia,
} from "./create-post.service";

type Queryable = Pick<DayliDatabase, "select" | "insert">;

/** Distinct from the relationship pair lock namespace, which uses 734 directly on a pair key. */
function authorLockKey(authorId: string): string {
  return `posts:author:${authorId}`;
}

function toStoredPost(media: StoredPostMedia[], row: {
  id: string;
  authorId: string;
  localDate: string;
  promptId: string;
  promptText: string;
  reflectiveAnswer: string;
  caption: string | null;
  rating: number;
  audience: DailyPostAudience;
  acceptedAt: Date;
  releasedAt: Date;
  tomorrowNoteAvailableOn: string | null;
}): StoredDailyPost {
  return {
    id: row.id,
    authorId: row.authorId,
    localDate: row.localDate,
    prompt: { id: row.promptId, text: row.promptText },
    reflectiveAnswer: row.reflectiveAnswer,
    caption: row.caption,
    rating: row.rating,
    audience: row.audience,
    acceptedAt: row.acceptedAt,
    releasedAt: row.releasedAt,
    tomorrowNoteAvailableOn: row.tomorrowNoteAvailableOn,
    media,
  };
}

/** The post's attached uploads in display order; detached and legacy rows are left out. */
async function readPostMedia(queryable: Queryable, postId: string): Promise<StoredPostMedia[]> {
  return queryable
    .select({
      id: schema.postMedia.id,
      contentType: schema.mediaReservation.contentType,
      order: schema.postMedia.attachmentOrder,
    })
    .from(schema.postMedia)
    .innerJoin(schema.mediaReservation, eq(schema.mediaReservation.id, schema.postMedia.reservationId))
    .where(and(eq(schema.postMedia.postId, postId), isNull(schema.postMedia.detachedAt)))
    .orderBy(asc(schema.postMedia.attachmentOrder));
}

async function readPost(queryable: Queryable, postId: string): Promise<StoredDailyPost | null> {
  const [row] = await queryable
    .select({
      id: schema.posts.id,
      authorId: schema.posts.authorId,
      localDate: schema.posts.localDate,
      promptId: schema.posts.promptId,
      promptText: schema.dailyPrompts.text,
      reflectiveAnswer: schema.posts.reflectiveAnswer,
      caption: schema.posts.caption,
      rating: schema.posts.rating,
      audience: schema.posts.audience,
      acceptedAt: schema.posts.acceptedAt,
      releasedAt: schema.posts.releasedAt,
      tomorrowNoteAvailableOn: schema.tomorrowNotes.availableOn,
    })
    .from(schema.posts)
    .innerJoin(schema.dailyPrompts, eq(schema.dailyPrompts.id, schema.posts.promptId))
    .leftJoin(schema.tomorrowNotes, eq(schema.tomorrowNotes.postId, schema.posts.id))
    .where(and(eq(schema.posts.id, postId), isNull(schema.posts.trashedAt)))
    .limit(1);
  return row ? toStoredPost(await readPostMedia(queryable, postId), row) : null;
}

function createTransaction(queryable: Queryable): DailyPostTransaction {
  return {
    async findIdempotentOutcome(authorId, idempotencyKey) {
      const [record] = await queryable
        .select({
          requestFingerprint: schema.postIdempotencyKeys.requestFingerprint,
          postId: schema.postIdempotencyKeys.postId,
          trashedAt: schema.posts.trashedAt,
        })
        .from(schema.postIdempotencyKeys)
        .innerJoin(schema.posts, eq(schema.posts.id, schema.postIdempotencyKeys.postId))
        .where(and(
          eq(schema.postIdempotencyKeys.authorId, authorId),
          eq(schema.postIdempotencyKeys.idempotencyKey, idempotencyKey),
        ))
        .limit(1);
      if (!record) return null;
      // A retained key for a trashed post can't replay hidden content or be
      // reused for a replacement, so a retry gets POST_TRASHED. Purge removes
      // the key with its post.
      const post = record.trashedAt ? null : await readPost(queryable, record.postId);
      return { requestFingerprint: record.requestFingerprint, post };
    },

    async hasPostForDay(authorId, localDate) {
      const rows = await queryable
        .select({ id: schema.posts.id })
        .from(schema.posts)
        .where(and(
          eq(schema.posts.authorId, authorId),
          eq(schema.posts.localDate, localDate),
          isNull(schema.posts.trashedAt),
        ))
        .limit(1);
      return rows.length > 0;
    },

    async findActivePrompt(localDate) {
      const prompt = await createDailyPromptRepository(queryable as DayliDatabase)
        .findActivePrompt(localDate.slice(5), localDate);
      return prompt ? { id: prompt.id, text: prompt.text } : null;
    },

    async lockAttachableMedia(authorId, reservationIds) {
      const reservations = await queryable
        .select({
          reservationId: schema.mediaReservation.id,
          status: schema.mediaReservation.status,
          contentType: schema.mediaReservation.contentType,
          byteSize: schema.mediaReservation.byteSize,
          expiresAt: schema.mediaReservation.expiresAt,
          cleanupClaimedAt: schema.mediaReservation.cleanupClaimedAt,
        })
        .from(schema.mediaReservation)
        .where(and(
          inArray(schema.mediaReservation.id, [...reservationIds]),
          eq(schema.mediaReservation.ownerId, authorId),
        ))
        .for("update");
      if (reservations.length === 0) return [];
      const linked = await queryable
        .select({ reservationId: schema.postMedia.reservationId })
        .from(schema.postMedia)
        .where(inArray(schema.postMedia.reservationId, reservations.map((row) => row.reservationId)));
      const avatarLinks = await queryable
        .select({ reservationId: schema.profileAvatars.reservationId })
        .from(schema.profileAvatars)
        .where(inArray(schema.profileAvatars.reservationId, reservations.map((row) => row.reservationId)));
      const linkedIds = new Set([...linked, ...avatarLinks].map((row) => row.reservationId));
      return reservations.map(({ cleanupClaimedAt, ...row }) => ({
        ...row,
        // Cleanup tombstones the upload under this same row lock, so a claimed
        // upload reads as already used and is never attached.
        linked: linkedIds.has(row.reservationId) || cleanupClaimedAt !== null,
      }));
    },

    async insertPost(post) {
      try {
        await queryable.insert(schema.posts).values({
          id: post.id,
          authorId: post.authorId,
          localDate: post.localDate,
          promptId: post.promptId,
          reflectiveAnswer: post.reflectiveAnswer,
          caption: post.caption,
          rating: post.rating,
          audience: post.audience,
          acceptedAt: post.acceptedAt,
          releasedAt: post.releasedAt,
        });
      } catch (error) {
        if (classifyPostgresConstraintError(error) === "unique") throw new CreateDailyPostError("ALREADY_POSTED");
        throw error;
      }
      if (post.tomorrowNote) {
        await queryable.insert(schema.tomorrowNotes).values({
          id: post.tomorrowNote.id,
          postId: post.id,
          authorId: post.authorId,
          note: post.tomorrowNote.note,
          availableOn: post.tomorrowNote.availableOn,
        });
      }
      if (post.media.length > 0) {
        try {
          await queryable.insert(schema.postMedia).values(post.media.map((media) => ({
            id: media.id,
            postId: post.id,
            attachmentOrder: media.order,
            reservationId: media.reservationId,
          })));
        } catch (error) {
          // The service checked every upload under the row lock, so this is a
          // backstop: an upload attaches to at most one post.
          if (classifyPostgresConstraintError(error) === "unique") throw new CreateDailyPostError("MEDIA_UNAVAILABLE");
          throw error;
        }
      }
      await queryable.insert(schema.postIdempotencyKeys).values({
        authorId: post.authorId,
        idempotencyKey: post.idempotencyKey,
        requestFingerprint: post.requestFingerprint,
        postId: post.id,
      });
      const stored = await readPost(queryable, post.id);
      if (!stored) throw new Error("The inserted post could not be read back.");
      return stored;
    },
  };
}

/** Serialise one author's submissions with a transaction-scoped advisory lock. */
export function createPostgresDailyPostStore(database: DayliDatabase): DailyPostStore {
  return {
    withAuthorTransaction(authorId, operation) {
      return database.transaction(async (tx) => {
        await tx
          .select({ locked: sql`pg_advisory_xact_lock(hashtextextended(${authorLockKey(authorId)}, 734))` })
          .from(sql`(values (1)) as lock_source`);
        // This matches the Trash command lock order. A pending deletion that
        // commits while the submission waits must not admit another post.
        const [author] = await tx.select({ id: schema.user.id })
          .from(schema.user).where(eq(schema.user.id, authorId)).for("update");
        const [lifecycle] = author
          ? await tx.select({ state: schema.accountLifecycles.state })
            .from(schema.accountLifecycles)
            .where(eq(schema.accountLifecycles.userId, authorId)).for("share")
          : [];
        if (!author || (lifecycle && lifecycle.state !== "active")) {
          throw new CreateDailyPostError("ACCOUNT_RESTRICTED");
        }
        return operation(createTransaction(tx));
      });
    },
  };
}

/** Workers close the request-scoped Hyperdrive client after each submission. */
export function createHyperdriveDailyPostStore(hyperdrive: HyperdriveBinding): DailyPostStore {
  return {
    async withAuthorTransaction(authorId, operation) {
      const database = createHyperdriveDatabase(hyperdrive);
      try {
        return await createPostgresDailyPostStore(database.db).withAuthorTransaction(authorId, operation);
      } finally {
        await database.close();
      }
    },
  };
}
