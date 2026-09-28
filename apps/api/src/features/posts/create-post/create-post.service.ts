import type { AucklandDayService, ClockLike } from "@dayli/domain";

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
  idempotencyKey: string;
  requestFingerprint: string;
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
   * Insert the post, its optional tomorrow note, and the idempotency record
   * atomically. Must throw CreateDailyPostError("ALREADY_POSTED") when the
   * author/day uniqueness constraint rejects the insert.
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
  | "PROMPT_UNAVAILABLE";

const messages: Record<CreateDailyPostErrorReason, string> = {
  POSTING_DAY_CLOSED: "The posting day for this draft has ended.",
  POSTING_DAY_NOT_OPEN: "The posting day for this draft has not started.",
  PROMPT_CHANGED: "The prompt does not match the prompt for this posting day.",
  ALREADY_POSTED: "A post already exists for this posting day.",
  IDEMPOTENCY_KEY_REUSED: "This idempotency key was already used for a different request.",
  PROMPT_UNAVAILABLE: "The daily prompt is temporarily unavailable.",
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
 */
export async function fingerprintDailyPostRequest(input: CreateDailyPostInput): Promise<string> {
  const canonical = JSON.stringify([
    1,
    input.localDate,
    input.promptId,
    input.reflectiveAnswer,
    input.caption ?? null,
    input.rating,
    input.audience,
    input.tomorrowNote ?? null,
  ]);
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonical));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
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
          idempotencyKey,
          requestFingerprint,
        });
        return { post, replayed: false };
      });
    },
  };
}
