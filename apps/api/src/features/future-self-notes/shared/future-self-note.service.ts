import type { AucklandDayService, ClockLike } from "@dayli/domain";
import { decodeFutureSelfNoteCursor, encodeFutureSelfNoteCursor, type FutureSelfNoteCursor } from "./future-self-note.cursor";
import { isDeliverOnAllowed, isNoteReadable } from "./future-self-note.policy";

export type FutureSelfNoteStatus = "scheduled" | "delivered";

/** A note without its text. Safe to return whatever the delivery date is. */
export interface FutureSelfNoteSummary {
  id: string;
  deliverOn: string;
  status: FutureSelfNoteStatus;
  deliveredAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface StoredFutureSelfNote extends FutureSelfNoteSummary {
  ownerId: string;
  body: string;
  scheduleVersion: number;
}

export interface FutureSelfNoteDetail extends FutureSelfNoteSummary {
  body: string;
}

export interface NewFutureSelfNote {
  id: string;
  ownerId: string;
  body: string;
  deliverOn: string;
  createdAt: Date;
  idempotencyKey: string;
  requestFingerprint: string;
}

export interface FutureSelfNoteChanges {
  body?: string;
  deliverOn?: string;
  /** Set with deliverOn: invalidates any delivery already claimed for the old date. */
  reschedule: boolean;
  updatedAt: Date;
}

export interface FutureSelfNoteListInput {
  limit: number;
  cursor?: FutureSelfNoteCursor;
}

export interface FutureSelfNoteReader {
  /** The caller's own note, or null. Another owner's note is indistinguishable from a missing one. */
  findNote(ownerId: string, noteId: string): Promise<StoredFutureSelfNote | null>;
  /** Summaries only: the note text is never selected for a list. Returns up to `limit + 1` rows. */
  listNotes(ownerId: string, input: FutureSelfNoteListInput): Promise<FutureSelfNoteSummary[]>;
}

/** Operations while the store holds the owner's lock; reads and writes see one consistent state. */
export interface FutureSelfNoteTransaction extends FutureSelfNoteReader {
  findIdempotentOutcome(ownerId: string, idempotencyKey: string): Promise<{ requestFingerprint: string; note: StoredFutureSelfNote } | null>;
  insertNote(note: NewFutureSelfNote): Promise<StoredFutureSelfNote>;
  /** The caller's own note, locked for the rest of the transaction. */
  findNoteForUpdate(ownerId: string, noteId: string): Promise<StoredFutureSelfNote | null>;
  updateNote(noteId: string, changes: FutureSelfNoteChanges): Promise<StoredFutureSelfNote>;
  deleteNote(noteId: string): Promise<void>;
}

/**
 * Both entry points refuse an owner who is missing or whose account is not
 * active (throwing ACCOUNT_RESTRICTED), so deleting an account hides its notes
 * at once.
 */
export interface FutureSelfNoteStore {
  withOwnerTransaction<T>(ownerId: string, operation: (transaction: FutureSelfNoteTransaction) => Promise<T>): Promise<T>;
  withOwnerRead<T>(ownerId: string, operation: (reader: FutureSelfNoteReader) => Promise<T>): Promise<T>;
}

export type FutureSelfNoteErrorReason =
  | "ACCOUNT_RESTRICTED"
  | "DELIVER_ON_OUT_OF_RANGE"
  | "IDEMPOTENCY_KEY_REUSED"
  | "INVALID_CURSOR"
  | "NOTE_NOT_FOUND"
  | "NOTE_NOT_YET_AVAILABLE"
  | "NOTE_ALREADY_DELIVERED";

const messages: Record<FutureSelfNoteErrorReason, string> = {
  ACCOUNT_RESTRICTED: "Future-self notes are unavailable while account deletion is pending.",
  DELIVER_ON_OUT_OF_RANGE: "The delivery date must be from tomorrow, in Auckland, up to 10 years ahead.",
  IDEMPOTENCY_KEY_REUSED: "This idempotency key was already used for a different request.",
  INVALID_CURSOR: "The page cursor is not valid.",
  NOTE_NOT_FOUND: "The note was not found.",
  NOTE_NOT_YET_AVAILABLE: "The note can't be read before its delivery date.",
  NOTE_ALREADY_DELIVERED: "A delivered note can no longer be edited.",
};

export class FutureSelfNoteError extends Error {
  readonly reason: FutureSelfNoteErrorReason;

  constructor(reason: FutureSelfNoteErrorReason) {
    super(messages[reason]);
    this.name = "FutureSelfNoteError";
    this.reason = reason;
  }
}

export interface FutureSelfNotePage {
  items: FutureSelfNoteSummary[];
  nextCursor: string | null;
  hasMore: boolean;
}

export interface FutureSelfNoteService {
  create(ownerId: string, idempotencyKey: string, input: { body: string; deliverOn: string }): Promise<{ note: FutureSelfNoteSummary; replayed: boolean }>;
  list(ownerId: string, input: { limit: number; cursor?: string }): Promise<FutureSelfNotePage>;
  get(ownerId: string, noteId: string): Promise<FutureSelfNoteDetail>;
  update(ownerId: string, noteId: string, input: { body?: string; deliverOn?: string }): Promise<FutureSelfNoteSummary>;
  remove(ownerId: string, noteId: string): Promise<void>;
}

export interface FutureSelfNoteServiceDependencies {
  store: FutureSelfNoteStore;
  clock: ClockLike;
  dayService: AucklandDayService;
  generateId?: () => string;
}

function readNow(clock: ClockLike): Date {
  const now = typeof clock === "function" ? clock() : clock.now();
  if (!(now instanceof Date) || Number.isNaN(now.getTime())) throw new TypeError("The clock must return a valid Date.");
  return new Date(now.getTime());
}

/** A digest of every field that defines the request, so a retry matches and a changed request conflicts. */
export async function fingerprintFutureSelfNoteRequest(input: { body: string; deliverOn: string }): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify([1, input.body, input.deliverOn])));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** Drops the text and internals. Nothing but this projection leaves the service for a list, create, or edit. */
export function summarizeFutureSelfNote(note: FutureSelfNoteSummary): FutureSelfNoteSummary {
  return {
    id: note.id,
    deliverOn: note.deliverOn,
    status: note.status,
    deliveredAt: note.deliveredAt,
    createdAt: note.createdAt,
    updatedAt: note.updatedAt,
  };
}

export function createFutureSelfNoteService(dependencies: FutureSelfNoteServiceDependencies): FutureSelfNoteService {
  const generateId = dependencies.generateId ?? (() => crypto.randomUUID());
  const today = (now: Date) => dependencies.dayService.forInstant(now).localDate;

  return {
    async create(ownerId, idempotencyKey, input) {
      const requestFingerprint = await fingerprintFutureSelfNoteRequest(input);
      return dependencies.store.withOwnerTransaction(ownerId, async (transaction) => {
        // A replay is answered before the date check, so a lost response can be
        // recovered after the window has moved on.
        const previous = await transaction.findIdempotentOutcome(ownerId, idempotencyKey);
        if (previous) {
          if (previous.requestFingerprint !== requestFingerprint) throw new FutureSelfNoteError("IDEMPOTENCY_KEY_REUSED");
          return { note: summarizeFutureSelfNote(previous.note), replayed: true };
        }

        // The server's Auckland date, read after the owner lock is held. The
        // device clock and UTC date never decide the window.
        const createdAt = readNow(dependencies.clock);
        if (!isDeliverOnAllowed(input.deliverOn, today(createdAt))) throw new FutureSelfNoteError("DELIVER_ON_OUT_OF_RANGE");

        const note = await transaction.insertNote({
          id: generateId(),
          ownerId,
          body: input.body,
          deliverOn: input.deliverOn,
          createdAt,
          idempotencyKey,
          requestFingerprint,
        });
        return { note: summarizeFutureSelfNote(note), replayed: false };
      });
    },

    async list(ownerId, input) {
      const cursor = decodeFutureSelfNoteCursor(input.cursor);
      if (cursor === null) throw new FutureSelfNoteError("INVALID_CURSOR");
      return dependencies.store.withOwnerRead(ownerId, async (reader) => {
        const rows = await reader.listNotes(ownerId, { limit: input.limit, cursor });
        const hasMore = rows.length > input.limit;
        const items = rows.slice(0, input.limit).map(summarizeFutureSelfNote);
        const last = items.at(-1);
        return {
          items,
          hasMore,
          nextCursor: hasMore && last ? encodeFutureSelfNoteCursor({ deliverOn: last.deliverOn, id: last.id }) : null,
        };
      });
    },

    async get(ownerId, noteId) {
      return dependencies.store.withOwnerRead(ownerId, async (reader) => {
        const note = await reader.findNote(ownerId, noteId);
        if (!note) throw new FutureSelfNoteError("NOTE_NOT_FOUND");
        if (!isNoteReadable(note, today(readNow(dependencies.clock)))) throw new FutureSelfNoteError("NOTE_NOT_YET_AVAILABLE");
        return { ...summarizeFutureSelfNote(note), body: note.body };
      });
    },

    async update(ownerId, noteId, input) {
      return dependencies.store.withOwnerTransaction(ownerId, async (transaction) => {
        const note = await transaction.findNoteForUpdate(ownerId, noteId);
        if (!note) throw new FutureSelfNoteError("NOTE_NOT_FOUND");
        if (note.status === "delivered") throw new FutureSelfNoteError("NOTE_ALREADY_DELIVERED");

        const updatedAt = readNow(dependencies.clock);
        // Resending the current date is not a reschedule, so it needs no new window check.
        const reschedule = input.deliverOn !== undefined && input.deliverOn !== note.deliverOn;
        if (reschedule && !isDeliverOnAllowed(input.deliverOn!, today(updatedAt))) {
          throw new FutureSelfNoteError("DELIVER_ON_OUT_OF_RANGE");
        }
        const bodyChanged = input.body !== undefined && input.body !== note.body;
        if (!reschedule && !bodyChanged) return summarizeFutureSelfNote(note);

        const updated = await transaction.updateNote(note.id, {
          body: bodyChanged ? input.body : undefined,
          deliverOn: reschedule ? input.deliverOn : undefined,
          reschedule,
          updatedAt,
        });
        return summarizeFutureSelfNote(updated);
      });
    },

    async remove(ownerId, noteId) {
      await dependencies.store.withOwnerTransaction(ownerId, async (transaction) => {
        const note = await transaction.findNoteForUpdate(ownerId, noteId);
        if (!note) throw new FutureSelfNoteError("NOTE_NOT_FOUND");
        await transaction.deleteNote(note.id);
      });
    },
  };
}
