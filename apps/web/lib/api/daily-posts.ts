import {
  FetchError,
  MediaApi,
  MediaContentType,
  PostingDaysApi,
  PostsApi,
  ResponseError,
  type CurrentPostingDayResponse,
  type DailyPost,
  type PostAudience,
  type CreateMediaReservationResponse,
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
  attachments?: string[];
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
  | "POST_TRASHED"
  | "MEDIA_NOT_READY"
  | "MEDIA_UNAVAILABLE"
  | "UNKNOWN";

export type ApiResult<T> = { ok: true; value: T } | { ok: false; failure: ApiFailure };

const conflictReasons = new Set<DailyPostConflictReason>([
  "POSTING_DAY_CLOSED",
  "POSTING_DAY_NOT_OPEN",
  "PROMPT_CHANGED",
  "ALREADY_POSTED",
  "IDEMPOTENCY_KEY_REUSED",
  "POST_TRASHED",
  "MEDIA_NOT_READY",
  "MEDIA_UNAVAILABLE",
]);

class PostMediaError extends Error {
  constructor(readonly failure: ApiFailure) {
    super("Media upload could not be completed.");
  }
}

async function toFailure(error: unknown): Promise<ApiFailure> {
  if (error instanceof PostMediaError) return error.failure;
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

const visualTypes = new Set<string>([
  MediaContentType.ImageJpeg, MediaContentType.ImagePng, MediaContentType.ImageWebp,
  MediaContentType.ImageHeic, MediaContentType.VideoMp4, MediaContentType.VideoQuicktime,
]);

/** Check the API's visual attachment limits before reserving or sending bytes. */
export function validatePostMedia(files: readonly File[]): string | undefined {
  if (files.some((file) => !visualTypes.has(file.type))) {
    return "Choose JPEG, PNG, WebP or HEIC photos, or an MP4 or MOV video.";
  }
  const photos = files.filter((file) => file.type.startsWith("image/")).length;
  const videos = files.length - photos;
  if (photos > 3 || videos > 1 || (photos > 0 && videos > 0)) {
    return "Choose up to 3 photos or 1 video, never both.";
  }
  if (files.some((file) => file.size === 0 || file.size > 10 * 1024 * 1024)) {
    return "Each photo or video must be non-empty and at most 10 MB.";
  }
  if (files.reduce((total, file) => total + file.size, 0) > 25 * 1024 * 1024) {
    return "Photos must total at most 25 MB.";
  }
}

/** One instance per composer, so retries keep the same uploads and attachment IDs. */
export function createDailyPostSubmitter() {
  const uploads = new Map<File, {
    reservation: CreateMediaReservationResponse;
    uploaded: boolean;
    validated: boolean;
  }>();

  return async (draft: DailyPostDraft, files: readonly File[], idempotencyKey: string): Promise<ApiResult<DailyPost>> => {
    const message = validatePostMedia(files);
    if (message) return { ok: false, failure: { kind: "invalid", message } };

    const result = await call(async (configuration) => {
      const media = new MediaApi(configuration);
      const attachments: string[] = [];
      for (const file of files) {
        let upload = uploads.get(file);
        if (upload && !upload.validated && upload.reservation.expiresAt.getTime() <= Date.now()) {
          uploads.delete(file);
          upload = undefined;
        }
        if (!upload) {
          upload = {
            reservation: await media.mediaReservationsCreate({
              createMediaReservationRequest: { contentType: file.type as MediaContentType, byteSize: file.size },
            }),
            uploaded: false,
            validated: false,
          };
          uploads.set(file, upload);
        }
        if (!upload.uploaded) {
          // The browser supplies content-length. All other signed headers must be preserved.
          const headers = Object.fromEntries(Object.entries(upload.reservation.upload.requiredHeaders)
            .filter(([name]) => name.toLowerCase() !== "content-length"));
          const response = await fetch(upload.reservation.upload.url, { method: "PUT", headers, body: file });
          // A lost PUT response can be retried: 412 means this single-use object already exists.
          if (!response.ok && response.status !== 412) throw new ResponseError(response);
          upload.uploaded = true;
        }
        if (!upload.validated) {
          const checked = await media.mediaReservationsComplete({ id: upload.reservation.id });
          if (checked.status === "pending") {
            throw new PostMediaError({ kind: "conflict", reason: "MEDIA_NOT_READY",
              message: "An attachment is still being checked. Try posting again shortly.",
            });
          }
          if (checked.status !== "validated") {
            uploads.delete(file);
            throw new PostMediaError({ kind: "invalid",
              message: checked.failureReason === "duration_exceeded"
                ? "Videos must be at most 15 seconds. Choose a shorter video."
                : "A photo or video could not be validated. Choose another file and try again.",
            });
          }
          upload.validated = true;
        }
        attachments.push(upload.reservation.id);
      }
      return new PostsApi(configuration).postsCreate({
        idempotencyKey,
        createDailyPostRequest: { ...draft, ...(attachments.length ? { attachments } : {}) },
      });
    });
    if (!result.ok && result.failure.kind === "conflict"
      && (result.failure.reason === "MEDIA_UNAVAILABLE" || result.failure.reason === "POST_TRASHED")) {
      uploads.clear();
    }
    return result;
  };
}
