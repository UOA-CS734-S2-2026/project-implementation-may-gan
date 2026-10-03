import { and, asc, eq, isNotNull } from "drizzle-orm";
import { createHyperdriveDatabase, schema, sql, type DayliDatabase, type HyperdriveBinding } from "@dayli/db";

export type TrashTransitionOutcome = "trashed" | "restored" | "already_trashed" | "already_active" | "expired" | "day_occupied" | "restricted" | "invalid_session" | "not_found" | "conflict";

export interface TrashedPostStatus {
  id: string;
  localDate: string;
  trashedAt: Date;
  restoreUntil: Date;
  purgeDueAt: Date;
  generation: number;
  pendingCleanup: boolean;
  failureCategory: string | null;
}

export interface PostTrashRepository {
  list(userId: string): Promise<TrashedPostStatus[]>;
  transition(input: { userId: string; sessionId: string; postId: string; action: "trash" | "restore" }): Promise<{
    outcome: TrashTransitionOutcome;
    status: TrashedPostStatus | null;
  }>;
}

function statusFromRow(row: {
  id: string;
  localDate: string;
  trashedAt: Date;
  restoreUntil: Date;
  purgeDueAt: Date;
  trashGeneration: number;
  trashLeaseToken: string | null;
  trashFailureCategory: string | null;
}): TrashedPostStatus {
  return {
    id: row.id,
    localDate: row.localDate,
    trashedAt: row.trashedAt,
    restoreUntil: row.restoreUntil,
    purgeDueAt: row.purgeDueAt,
    generation: row.trashGeneration,
    pendingCleanup: row.trashLeaseToken !== null,
    failureCategory: row.trashFailureCategory,
  };
}

async function readStatus(database: DayliDatabase, userId: string, postId: string): Promise<TrashedPostStatus | null> {
  const [row] = await database.select({
    id: schema.posts.id,
    localDate: schema.posts.localDate,
    trashedAt: schema.posts.trashedAt,
    restoreUntil: schema.posts.restoreUntil,
    purgeDueAt: schema.posts.trashPurgeDueAt,
    trashGeneration: schema.posts.trashGeneration,
    trashLeaseToken: schema.posts.trashLeaseToken,
    trashFailureCategory: schema.posts.trashFailureCategory,
  }).from(schema.posts).where(and(
    eq(schema.posts.id, postId), eq(schema.posts.authorId, userId), isNotNull(schema.posts.trashedAt),
  )).limit(1);
  return row && row.trashedAt && row.restoreUntil && row.purgeDueAt
    ? statusFromRow({ ...row, trashedAt: row.trashedAt!, restoreUntil: row.restoreUntil!, purgeDueAt: row.purgeDueAt! }) : null;
}

/** All state changes run through owner and session fenced database procedures. */
export function createPostgresPostTrashRepository(database: DayliDatabase): PostTrashRepository {
  return {
    async list(userId) {
      const rows = await database.select({
        id: schema.posts.id,
        localDate: schema.posts.localDate,
        trashedAt: schema.posts.trashedAt,
        restoreUntil: schema.posts.restoreUntil,
        purgeDueAt: schema.posts.trashPurgeDueAt,
        trashGeneration: schema.posts.trashGeneration,
        trashLeaseToken: schema.posts.trashLeaseToken,
        trashFailureCategory: schema.posts.trashFailureCategory,
      }).from(schema.posts).where(and(eq(schema.posts.authorId, userId), isNotNull(schema.posts.trashedAt)))
        .orderBy(asc(schema.posts.restoreUntil), asc(schema.posts.id));
      return rows.flatMap((row) => row.trashedAt && row.restoreUntil && row.purgeDueAt
        ? [statusFromRow({ ...row, trashedAt: row.trashedAt!, restoreUntil: row.restoreUntil!, purgeDueAt: row.purgeDueAt! })] : []);
    },

    async transition({ userId, sessionId, postId, action }) {
      const procedure = action === "trash" ? sql`public.move_post_to_trash(${userId}, ${sessionId}, ${postId})`
        : sql`public.restore_trashed_post(${userId}, ${sessionId}, ${postId})`;
      const [result] = await database.select({ outcome: sql<TrashTransitionOutcome>`outcome` }).from(procedure);
      if (!result) throw new Error("The post Trash procedure did not return an outcome.");
      // Read after the procedure commits its state. An active restored post has
      // no Trash projection, which is intentional.
      return { outcome: result.outcome, status: await readStatus(database, userId, postId) };
    },
  };
}

/** Each request owns and closes its Hyperdrive client. */
export function createHyperdrivePostTrashRepository(hyperdrive: HyperdriveBinding): PostTrashRepository {
  async function withRepository<T>(operation: (repository: PostTrashRepository) => Promise<T>): Promise<T> {
    const client = createHyperdriveDatabase(hyperdrive);
    try { return await operation(createPostgresPostTrashRepository(client.db)); }
    finally { await client.close(); }
  }
  return {
    list: (userId) => withRepository((repository) => repository.list(userId)),
    transition: (input) => withRepository((repository) => repository.transition(input)),
  };
}
