import {
  FetchError,
  PostingDaysApi,
  PostsApi,
  ResponseError,
  type CurrentPostingDayResponse,
  type DailyPost,
  type PostAudience,
} from "@dayli/api-client";
import { apiConfiguration } from "./config";

/**
 * Transport boundary between the web UI and the Hono REST API. Components
 * depend on these results, never on generated client classes or HTTP status
 * codes, so the transport can change without touching the UI.
 */

export type PostingDay = CurrentPostingDayResponse;
export type { DailyPost, PostAudience };

export interface DailyPostDraft {
  localDate: string;
  promptId: string;
  reflectiveAnswer: string;
  caption?: string;
  rating: number;
  audience: PostAudience;
  tomorrowNote?: string;
}

export type ApiFailure =
  | { kind: "unauthenticated" }
  | { kind: "unavailable" }
  | { kind: "network" }
  | { kind: "invalid"; message: string }
  | { kind: "conflict"; reason: DailyPostConflictReason; message: string };

export type DailyPostConflictReason =
  | "POSTING_DAY_CLOSED"
  | "POSTING_DAY_NOT_OPEN"
  | "PROMPT_CHANGED"
  | "ALREADY_POSTED"
  | "IDEMPOTENCY_KEY_REUSED"
  | "POST_DELETED"
  | "UNKNOWN";

export type ApiResult<T> = { ok: true; value: T } | { ok: false; failure: ApiFailure };

const conflictReasons = new Set<DailyPostConflictReason>([
  "POSTING_DAY_CLOSED",
  "POSTING_DAY_NOT_OPEN",
  "PROMPT_CHANGED",
  "ALREADY_POSTED",
  "IDEMPOTENCY_KEY_REUSED",
  "POST_DELETED",
]);

async function toFailure(error: unknown): Promise<ApiFailure> {
  if (error instanceof ResponseError) {
    const body = await error.response.json().catch(() => undefined) as
      | { error?: { message?: string; details?: { reason?: string } } }
      | undefined;
    const message = body?.error?.message ?? "The request could not be completed.";
    switch (error.response.status) {
      case 401: return { kind: "unauthenticated" };
      case 409: {
        const reason = body?.error?.details?.reason as DailyPostConflictReason | undefined;
        return { kind: "conflict", reason: reason && conflictReasons.has(reason) ? reason : "UNKNOWN", message };
      }
      case 400:
      case 422: return { kind: "invalid", message };
      default: return { kind: "unavailable" };
    }
  }
  if (error instanceof FetchError || error instanceof TypeError) return { kind: "network" };
  return { kind: "unavailable" };
}

async function call<T>(operation: (configuration: NonNullable<ReturnType<typeof apiConfiguration>>) => Promise<T>): Promise<ApiResult<T>> {
  const configuration = apiConfiguration();
  if (!configuration) return { ok: false, failure: { kind: "unavailable" } };
  try {
    return { ok: true, value: await operation(configuration) };
  } catch (error) {
    return { ok: false, failure: await toFailure(error) };
  }
}

export function getCurrentPostingDay(): Promise<ApiResult<PostingDay>> {
  return call((configuration) => new PostingDaysApi(configuration).postingDaysCurrent({ cache: "no-store" }));
}

/**
 * Submit a draft. Reuse the same idempotency key for every retry of one draft
 * so a lost response can never create a second post.
 */
export function submitDailyPost(draft: DailyPostDraft, idempotencyKey: string): Promise<ApiResult<DailyPost>> {
  return call((configuration) => new PostsApi(configuration).postsCreate({
    idempotencyKey,
    createDailyPostRequest: draft,
  }));
}
