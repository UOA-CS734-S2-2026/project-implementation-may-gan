import { and, eq } from "drizzle-orm";
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
} from "./create-post.service";

type Queryable = Pick<DayliDatabase, "select" | "insert" | "execute">;

/** Distinct from the relationship pair lock namespace, which uses 734 directly on a pair key. */
function authorLockKey(authorId: string): string {
  return `posts:author:${authorId}`;
}

function toStoredPost(row: {
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
  };
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
    .where(eq(schema.posts.id, postId))
    .limit(1);
  return row ? toStoredPost(row) : null;
}

function createTransaction(queryable: Queryable): DailyPostTransaction {
  return {
    async findIdempotentOutcome(authorId, idempotencyKey) {
      const [record] = await queryable
        .select({
          requestFingerprint: schema.postIdempotencyKeys.requestFingerprint,
          postId: schema.postIdempotencyKeys.postId,
        })
        .from(schema.postIdempotencyKeys)
        .where(and(
          eq(schema.postIdempotencyKeys.authorId, authorId),
          eq(schema.postIdempotencyKeys.idempotencyKey, idempotencyKey),
        ))
        .limit(1);
      if (!record) return null;
      const post = await readPost(queryable, record.postId);
      // The idempotency row cascades with its post, so a missing post means
      // cleanup is mid-flight; treat the key as unused rather than replaying.
      return post ? { requestFingerprint: record.requestFingerprint, post } : null;
    },

    async hasPostForDay(authorId, localDate) {
      const rows = await queryable
        .select({ id: schema.posts.id })
        .from(schema.posts)
        .where(and(eq(schema.posts.authorId, authorId), eq(schema.posts.localDate, localDate)))
        .limit(1);
      return rows.length > 0;
    },

    async findActivePrompt(localDate) {
      const prompt = await createDailyPromptRepository(queryable as DayliDatabase)
        .findActivePrompt(localDate.slice(5), localDate);
      return prompt ? { id: prompt.id, text: prompt.text } : null;
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
