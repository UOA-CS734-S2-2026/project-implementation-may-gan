import { and, asc, eq, gt, or } from "drizzle-orm";
import {
  createHyperdriveDatabase,
  schema,
  sql,
  type DayliDatabase,
  type HyperdriveBinding,
} from "@dayli/db";
import {
  FutureSelfNoteError,
  type FutureSelfNoteReader,
  type FutureSelfNoteStore,
  type FutureSelfNoteSummary,
  type FutureSelfNoteTransaction,
  type StoredFutureSelfNote,
} from "./future-self-note.service";

type Queryable = Pick<DayliDatabase, "select" | "insert" | "update" | "delete">;

/** Distinct from the post author lock namespace. */
function ownerLockKey(ownerId: string): string {
  return `future-self-notes:owner:${ownerId}`;
}

/** Never includes the text, so a list cannot leak a note that is not yet readable. */
const summaryColumns = {
  id: schema.futureSelfNotes.id,
  deliverOn: schema.futureSelfNotes.deliverOn,
  status: schema.futureSelfNotes.status,
  deliveredAt: schema.futureSelfNotes.deliveredAt,
  createdAt: schema.futureSelfNotes.createdAt,
  updatedAt: schema.futureSelfNotes.updatedAt,
};

const noteColumns = {
  ...summaryColumns,
  ownerId: schema.futureSelfNotes.ownerId,
  body: schema.futureSelfNotes.body,
  scheduleVersion: schema.futureSelfNotes.scheduleVersion,
};

function createReader(queryable: Queryable): FutureSelfNoteReader & {
  findNoteForUpdate: FutureSelfNoteTransaction["findNoteForUpdate"];
} {
  const findNoteQuery = (ownerId: string, noteId: string) => queryable
    .select(noteColumns)
    .from(schema.futureSelfNotes)
    .where(and(eq(schema.futureSelfNotes.id, noteId), eq(schema.futureSelfNotes.ownerId, ownerId)))
    .limit(1);
  return {
    async findNote(ownerId, noteId) {
      const [note] = await findNoteQuery(ownerId, noteId);
      return note ?? null;
    },
    async findNoteForUpdate(ownerId, noteId) {
      const [note] = await findNoteQuery(ownerId, noteId).for("update");
      return note ?? null;
    },
    async listNotes(ownerId, { limit, cursor }): Promise<FutureSelfNoteSummary[]> {
      return queryable
        .select(summaryColumns)
        .from(schema.futureSelfNotes)
        .where(and(
          eq(schema.futureSelfNotes.ownerId, ownerId),
          cursor
            ? or(
              gt(schema.futureSelfNotes.deliverOn, cursor.deliverOn),
              and(eq(schema.futureSelfNotes.deliverOn, cursor.deliverOn), gt(schema.futureSelfNotes.id, cursor.id)),
            )
            : undefined,
        ))
        .orderBy(asc(schema.futureSelfNotes.deliverOn), asc(schema.futureSelfNotes.id))
        .limit(limit + 1);
    },
  };
}

function createTransaction(queryable: Queryable): FutureSelfNoteTransaction {
  const reader = createReader(queryable);
  return {
    ...reader,
    async findIdempotentOutcome(ownerId, idempotencyKey) {
      const [record] = await queryable
        .select({ requestFingerprint: schema.futureSelfNoteIdempotencyKeys.requestFingerprint, noteId: schema.futureSelfNoteIdempotencyKeys.noteId })
        .from(schema.futureSelfNoteIdempotencyKeys)
        .where(and(
          eq(schema.futureSelfNoteIdempotencyKeys.ownerId, ownerId),
          eq(schema.futureSelfNoteIdempotencyKeys.idempotencyKey, idempotencyKey),
        ))
        .limit(1);
      if (!record) return null;
      const note = await reader.findNote(ownerId, record.noteId);
      // The key cascades with its note, so a missing note means a retained key must not replay.
      if (!note) throw new FutureSelfNoteError("IDEMPOTENCY_KEY_REUSED");
      return { requestFingerprint: record.requestFingerprint, note };
    },

    async insertNote(note) {
      const [stored] = await queryable.insert(schema.futureSelfNotes).values({
        id: note.id,
        ownerId: note.ownerId,
        body: note.body,
        deliverOn: note.deliverOn,
        createdAt: note.createdAt,
        updatedAt: note.createdAt,
      }).returning(noteColumns);
      await queryable.insert(schema.futureSelfNoteIdempotencyKeys).values({
        ownerId: note.ownerId,
        idempotencyKey: note.idempotencyKey,
        requestFingerprint: note.requestFingerprint,
        noteId: note.id,
      });
      if (!stored) throw new Error("The inserted note could not be read back.");
      return stored satisfies StoredFutureSelfNote;
    },

    async updateNote(noteId, changes) {
      const [stored] = await queryable
        .update(schema.futureSelfNotes)
        .set({
          ...(changes.body === undefined ? {} : { body: changes.body }),
          ...(changes.deliverOn === undefined ? {} : { deliverOn: changes.deliverOn }),
          ...(changes.reschedule ? { scheduleVersion: sql`${schema.futureSelfNotes.scheduleVersion} + 1` } : {}),
          updatedAt: changes.updatedAt,
        })
        .where(eq(schema.futureSelfNotes.id, noteId))
        .returning(noteColumns);
      if (!stored) throw new FutureSelfNoteError("NOTE_NOT_FOUND");
      return stored;
    },

    async deleteNote(noteId) {
      // Delivery and idempotency rows cascade, so a claimed reminder is dropped with its note.
      await queryable.delete(schema.futureSelfNotes).where(eq(schema.futureSelfNotes.id, noteId));
    },
  };
}

/** Throws ACCOUNT_RESTRICTED unless the owner exists and is active. `share` locks serialise with a deletion request. */
async function requireActiveOwner(tx: Queryable, ownerId: string, lock: "share" | undefined): Promise<void> {
  const ownerQuery = tx.select({ id: schema.user.id }).from(schema.user).where(eq(schema.user.id, ownerId));
  const [owner] = lock ? await ownerQuery.for("share") : await ownerQuery;
  const lifecycleQuery = tx.select({ state: schema.accountLifecycles.state })
    .from(schema.accountLifecycles).where(eq(schema.accountLifecycles.userId, ownerId));
  const [lifecycle] = owner ? (lock ? await lifecycleQuery.for("share") : await lifecycleQuery) : [];
  if (!owner || (lifecycle && lifecycle.state !== "active")) throw new FutureSelfNoteError("ACCOUNT_RESTRICTED");
}

/**
 * Serialise one owner's writes with a transaction-scoped advisory lock, then
 * share-lock the account rows. This matches the account deletion lock order:
 * a pending deletion that commits first makes the operation fail, and one that
 * starts later waits for it.
 */
export function createPostgresFutureSelfNoteStore(database: DayliDatabase): FutureSelfNoteStore {
  return {
    withOwnerTransaction(ownerId, operation) {
      return database.transaction(async (tx) => {
        await tx
          .select({ locked: sql`pg_advisory_xact_lock(hashtextextended(${ownerLockKey(ownerId)}, 734))` })
          .from(sql`(values (1)) as lock_source`);
        await requireActiveOwner(tx, ownerId, "share");
        return operation(createTransaction(tx));
      });
    },
    withOwnerRead(ownerId, operation) {
      return database.transaction(async (tx) => {
        await requireActiveOwner(tx, ownerId, undefined);
        return operation(createReader(tx));
      });
    },
  };
}

/** Workers close the request-scoped Hyperdrive client after each operation. */
export function createHyperdriveFutureSelfNoteStore(hyperdrive: HyperdriveBinding): FutureSelfNoteStore {
  async function withStore<T>(operation: (store: FutureSelfNoteStore) => Promise<T>): Promise<T> {
    const database = createHyperdriveDatabase(hyperdrive);
    try {
      return await operation(createPostgresFutureSelfNoteStore(database.db));
    } finally {
      await database.close();
    }
  }
  return {
    withOwnerTransaction: (ownerId, operation) => withStore((store) => store.withOwnerTransaction(ownerId, operation)),
    withOwnerRead: (ownerId, operation) => withStore((store) => store.withOwnerRead(ownerId, operation)),
  };
}
