import {
  FutureSelfNoteError,
  type FutureSelfNoteReader,
  type FutureSelfNoteStore,
  type FutureSelfNoteTransaction,
  type StoredFutureSelfNote,
} from "./future-self-note.service";

/**
 * An in-memory store for service and route tests. It follows the contract of the
 * PostgreSQL store (owner scoping, ordering, key replay, restricted accounts)
 * without a database. The integration tests cover the real constraints.
 */
export function createMemoryFutureSelfNoteStore(options: { restrictedOwners?: Set<string> } = {}) {
  const notes = new Map<string, StoredFutureSelfNote>();
  const keys = new Map<string, { requestFingerprint: string; noteId: string }>();
  const restricted = options.restrictedOwners ?? new Set<string>();

  const reader: FutureSelfNoteReader & Pick<FutureSelfNoteTransaction, "findNoteForUpdate"> = {
    async findNote(ownerId, noteId) {
      const note = notes.get(noteId);
      return note && note.ownerId === ownerId ? { ...note } : null;
    },
    async findNoteForUpdate(ownerId, noteId) {
      return reader.findNote(ownerId, noteId);
    },
    async listNotes(ownerId, { limit, cursor }) {
      return [...notes.values()]
        .filter((note) => note.ownerId === ownerId)
        .sort((a, b) => a.deliverOn.localeCompare(b.deliverOn) || a.id.localeCompare(b.id))
        .filter((note) => !cursor || note.deliverOn > cursor.deliverOn || (note.deliverOn === cursor.deliverOn && note.id > cursor.id))
        .slice(0, limit + 1)
        // The text is never part of a list row, as in the PostgreSQL store.
        .map(({ id, deliverOn, status, deliveredAt, createdAt, updatedAt }) => ({ id, deliverOn, status, deliveredAt, createdAt, updatedAt }));
    },
  };

  const transaction: FutureSelfNoteTransaction = {
    ...reader,
    async findIdempotentOutcome(ownerId, idempotencyKey) {
      const record = keys.get(`${ownerId}:${idempotencyKey}`);
      if (!record) return null;
      const note = notes.get(record.noteId);
      return note ? { requestFingerprint: record.requestFingerprint, note: { ...note } } : null;
    },
    async insertNote(note) {
      const stored: StoredFutureSelfNote = {
        id: note.id,
        ownerId: note.ownerId,
        body: note.body,
        deliverOn: note.deliverOn,
        status: "scheduled",
        scheduleVersion: 1,
        deliveredAt: null,
        createdAt: note.createdAt,
        updatedAt: note.createdAt,
      };
      notes.set(stored.id, stored);
      keys.set(`${note.ownerId}:${note.idempotencyKey}`, { requestFingerprint: note.requestFingerprint, noteId: stored.id });
      return { ...stored };
    },
    async updateNote(noteId, changes) {
      const note = notes.get(noteId);
      if (!note) throw new FutureSelfNoteError("NOTE_NOT_FOUND");
      if (changes.body !== undefined) note.body = changes.body;
      if (changes.deliverOn !== undefined) note.deliverOn = changes.deliverOn;
      if (changes.reschedule) note.scheduleVersion += 1;
      note.updatedAt = changes.updatedAt;
      return { ...note };
    },
    async deleteNote(noteId) {
      notes.delete(noteId);
      for (const [key, record] of keys) if (record.noteId === noteId) keys.delete(key);
    },
  };

  const guard = (ownerId: string) => {
    if (restricted.has(ownerId)) throw new FutureSelfNoteError("ACCOUNT_RESTRICTED");
  };

  const store: FutureSelfNoteStore = {
    async withOwnerTransaction(ownerId, operation) {
      guard(ownerId);
      return operation(transaction);
    },
    async withOwnerRead(ownerId, operation) {
      guard(ownerId);
      return operation(reader);
    },
  };

  return {
    store,
    notes,
    restrictedOwners: restricted,
    /** Mark a stored note delivered, as the delivery job would. */
    deliver(noteId: string, at: Date) {
      const note = notes.get(noteId);
      if (note) Object.assign(note, { status: "delivered", deliveredAt: at });
    },
  };
}
