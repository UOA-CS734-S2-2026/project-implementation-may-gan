import type { AucklandDayService, ClockLike } from "@dayli/domain";
import { MAX_POST_MEDIA_BYTES, MAX_POST_PHOTOS } from "@dayli/contracts";

export type DailyPostAudience = "solo" | "friends";

/** Validated transport input. Text fields are already trimmed and bounded. */
export interface CreateDailyPostInput {
  localDate: string;
  promptId: string;
  reflectiveAnswer: string;
  caption?: string;
  rating: number;
  audience: DailyPostAudience;
  tomorrowNote?: string;
  /** Validated media reservation IDs, in display order. */
  attachments?: readonly string[];
}

/** One attachment of a stored post, in display order. */
export interface StoredPostMedia {
  id: string;
  contentType: string;
  order: number;
}

export interface StoredDailyPost {
  id: string;
  authorId: string;
  localDate: string;
  prompt: { id: string; text: string };
  reflectiveAnswer: string;
  caption: string | null;
  rating: number;
  audience: DailyPostAudience;
  acceptedAt: Date;
  releasedAt: Date;
  tomorrowNoteAvailableOn: string | null;
  media: StoredPostMedia[];
}

export interface NewDailyPost {
  id: string;
  authorId: string;
  localDate: string;
  promptId: string;
  reflectiveAnswer: string;
  caption: string | null;
  rating: number;
  audience: DailyPostAudience;
  acceptedAt: Date;
  releasedAt: Date;
  tomorrowNote: { id: string; note: string; availableOn: string } | null;
  media: Array<{ id: string; reservationId: string; order: number }>;
  idempotencyKey: string;
  requestFingerprint: string;
}

/** A reservation owned by the author, locked for the rest of the transaction. */
export interface AttachableMedia {
  reservationId: string;
  status: "pending" | "validated" | "failed";
  contentType: string;
  byteSize: number;
  expiresAt: Date;
  /** True when a post already uses this upload, detached or not, or cleanup has claimed it. */
  linked: boolean;
}

export interface StoredIdempotentOutcome {
  requestFingerprint: string;
  post: StoredDailyPost;
}

/**
 * Operations available while the store holds the author's posting lock. The
 * lock serialises every submission by one author, so the idempotency lookup,
 * the one-post-per-day check, and the insert observe one consistent state.
 */
export interface DailyPostTransaction {
  findIdempotentOutcome(authorId: string, idempotencyKey: string): Promise<StoredIdempotentOutcome | null>;
  hasPostForDay(authorId: string, localDate: string): Promise<boolean>;
  findActivePrompt(localDate: string): Promise<{ id: string; text: string } | null>;
  /**
   * Lock the author's own reservations among [reservationIds] until the
   * transaction ends, so cleanup can't delete one while it is being attached.
   * Reservations that don't exist or belong to someone else are left out.
   */
  lockAttachableMedia(authorId: string, reservationIds: readonly string[]): Promise<AttachableMedia[]>;
  /**
   * Insert the post, its optional tomorrow note, its media links, and the
   * idempotency record atomically. Must throw CreateDailyPostError
   * ("ALREADY_POSTED") when the author/day uniqueness constraint rejects the
   * insert, and ("MEDIA_UNAVAILABLE") when an upload is already linked.
   */
  insertPost(post: NewDailyPost): Promise<StoredDailyPost>;
}

export interface DailyPostStore {
  withAuthorTransaction<T>(authorId: string, operation: (transaction: DailyPostTransaction) => Promise<T>): Promise<T>;
}

export type CreateDailyPostErrorReason =
  | "POSTING_DAY_CLOSED"
  | "POSTING_DAY_NOT_OPEN"
  | "PROMPT_CHANGED"
  | "ALREADY_POSTED"
  | "IDEMPOTENCY_KEY_REUSED"
  | "PROMPT_UNAVAILABLE"
  | "MEDIA_NOT_READY"
  | "MEDIA_UNAVAILABLE"
  | "MEDIA_NOT_ALLOWED";

const messages: Record<CreateDailyPostErrorReason, string> = {
  POSTING_DAY_CLOSED: "The posting day for this draft has ended.",
  POSTING_DAY_NOT_OPEN: "The posting day for this draft has not started.",
  PROMPT_CHANGED: "The prompt does not match the prompt for this posting day.",
  ALREADY_POSTED: "A post already exists for this posting day.",
  IDEMPOTENCY_KEY_REUSED: "This idempotency key was already used for a different request.",
  PROMPT_UNAVAILABLE: "The daily prompt is temporarily unavailable.",
  MEDIA_NOT_READY: "An attachment is still being uploaded.",
  // One message for missing, someone else's, rejected, expired, and already
  // used uploads, so a response never reveals another user's reservation.
  MEDIA_UNAVAILABLE: "An attachment can't be used. Upload it again.",
  MEDIA_NOT_ALLOWED: "A post can have up to 3 photos or 1 video, up to 25 MB in total.",
};

export class CreateDailyPostError extends Error {
  readonly reason: CreateDailyPostErrorReason;

  constructor(reason: CreateDailyPostErrorReason) {
    super(messages[reason]);
    this.name = "CreateDailyPostError";
    this.reason = reason;
  }
}

export interface CreateDailyPostResult {
  post: StoredDailyPost;
  /** True when an identical earlier request with the same key was replayed. */
  replayed: boolean;
}

export interface CreateDailyPostService {
  createDailyPost(authorId: string, idempotencyKey: string, input: CreateDailyPostInput): Promise<CreateDailyPostResult>;
}

export interface CreateDailyPostServiceDependencies {
  store: DailyPostStore;
  clock: ClockLike;
  dayService: AucklandDayService;
  generateId?: () => string;
}

function readNow(clock: ClockLike): Date {
  const now = typeof clock === "function" ? clock() : clock.now();
  if (!(now instanceof Date) || Number.isNaN(now.getTime())) {
    throw new TypeError("The clock must return a valid Date.");
  }
  return new Date(now.getTime());
}

/**
 * A stable digest of every field that defines the submission. Array order is
 * fixed, and absent optional text is encoded as null, so an omitted field and
 * an explicit null cannot be distinguished by a retry.
 *
 * A post without attachments keeps the version 1 encoding, so a retry of a
 * request stored before attachments existed still matches its fingerprint.
 * Attachments switch to version 2, which appends their IDs in order.
 */
export async function fingerprintDailyPostRequest(input: CreateDailyPostInput): Promise<string> {
  const fields = [
    input.localDate,
    input.promptId,
    input.reflectiveAnswer,
    input.caption ?? null,
    input.rating,
    input.audience,
    input.tomorrowNote ?? null,
  ];
  const attachments = input.attachments ?? [];
  const canonical = JSON.stringify(
    attachments.length === 0 ? [1, ...fields] : [2, ...fields, [...attachments]],
  );
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonical));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

/**
 * Check the author's locked reservations for [reservationIds] and return the
 * rows to link, in order. Pending uploads can still finish; anything else that
 * isn't a validated, unused upload of the author's must be uploaded again.
 */
function checkAttachments(
  reservationIds: readonly string[],
  available: AttachableMedia[],
  now: Date,
): Array<{ reservationId: string }> {
  if (reservationIds.length > MAX_POST_PHOTOS || new Set(reservationIds).size !== reservationIds.length) {
    throw new CreateDailyPostError("MEDIA_NOT_ALLOWED");
  }
  const byId = new Map(available.map((media) => [media.reservationId, media]));
  const ordered = reservationIds.map((id) => byId.get(id));

  // Report "still uploading" only when every attachment is otherwise usable,
  // so the client never waits on an upload that can't succeed.
  let waiting = false;
  for (const media of ordered) {
    if (!media || media.linked || media.status === "failed") throw new CreateDailyPostError("MEDIA_UNAVAILABLE");
    if (media.status === "pending") {
      if (media.expiresAt.getTime() <= now.getTime()) throw new CreateDailyPostError("MEDIA_UNAVAILABLE");
      waiting = true;
    }
  }
  if (waiting) throw new CreateDailyPostError("MEDIA_NOT_READY");

  const usable = ordered as AttachableMedia[];
  const videos = usable.filter((media) => media.contentType.startsWith("video/")).length;
  const photos = usable.filter((media) => media.contentType.startsWith("image/")).length;
  const composition = videos === 0 ? photos <= MAX_POST_PHOTOS : videos === 1 && photos === 0;
  const totalBytes = usable.reduce((sum, media) => sum + media.byteSize, 0);
  if (videos + photos !== usable.length || !composition || totalBytes > MAX_POST_MEDIA_BYTES) {
    throw new CreateDailyPostError("MEDIA_NOT_ALLOWED");
  }
  return usable.map((media) => ({ reservationId: media.reservationId }));
}

export function createDailyPostService(dependencies: CreateDailyPostServiceDependencies): CreateDailyPostService {
  const generateId = dependencies.generateId ?? (() => crypto.randomUUID());

  return {
    async createDailyPost(authorId, idempotencyKey, input) {
      const requestFingerprint = await fingerprintDailyPostRequest(input);

      return dependencies.store.withAuthorTransaction(authorId, async (transaction) => {
        // Replays are answered before any deadline check so a lost response
        // after an accepted submission can still be recovered after midnight.
        const previous = await transaction.findIdempotentOutcome(authorId, idempotencyKey);
        if (previous) {
          if (previous.requestFingerprint !== requestFingerprint) {
            throw new CreateDailyPostError("IDEMPOTENCY_KEY_REUSED");
          }
          return { post: previous.post, replayed: true };
        }

        // The clock is read after the author lock is held: eligibility is
        // decided at the authoritative write, not when the request arrived.
        const acceptedAt = readNow(dependencies.clock);
        const day = dependencies.dayService.forInstant(acceptedAt);
        if (input.localDate < day.localDate) throw new CreateDailyPostError("POSTING_DAY_CLOSED");
        if (input.localDate > day.localDate) throw new CreateDailyPostError("POSTING_DAY_NOT_OPEN");

        if (await transaction.hasPostForDay(authorId, day.localDate)) {
          throw new CreateDailyPostError("ALREADY_POSTED");
        }

        const prompt = await transaction.findActivePrompt(day.localDate);
        if (!prompt) throw new CreateDailyPostError("PROMPT_UNAVAILABLE");
        if (prompt.id !== input.promptId) throw new CreateDailyPostError("PROMPT_CHANGED");

        const reservationIds = input.attachments ?? [];
        const attachments = reservationIds.length === 0
          ? []
          : checkAttachments(
            reservationIds,
            await transaction.lockAttachableMedia(authorId, reservationIds),
            acceptedAt,
          );

        const nextDay = dependencies.dayService.forInstant(day.nextMidnightUtc).localDate;
        const post = await transaction.insertPost({
          id: generateId(),
          authorId,
          localDate: day.localDate,
          promptId: prompt.id,
          reflectiveAnswer: input.reflectiveAnswer,
          caption: input.caption ?? null,
          rating: input.rating,
          audience: input.audience,
          acceptedAt,
          releasedAt: day.nextMidnightUtc,
          tomorrowNote: input.tomorrowNote === undefined
            ? null
            : { id: generateId(), note: input.tomorrowNote, availableOn: nextDay },
          media: attachments.map(({ reservationId }, order) => ({ id: generateId(), reservationId, order })),
          idempotencyKey,
          requestFingerprint,
        });
        return { post, replayed: false };
      });
    },
  };
}
