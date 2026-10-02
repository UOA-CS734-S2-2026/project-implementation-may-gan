/**
 * Reservation policy. The media types and product limits live in
 * @dayli/contracts because posts check them too; they are re-exported here
 * for the media feature. Per-attachment size and type are checked at
 * reservation time, and the per-post limits when a post links its uploads.
 */
export {
  allowedContentTypes,
  isAudioContentType,
  MAX_ATTACHMENT_BYTES,
  MAX_VOICE_MEMO_BYTES,
  MAX_VOICE_MEMO_SECONDS,
  MAX_POST_VOICE_MEMOS,
  MAX_POST_MEDIA_BYTES,
  MAX_POST_PHOTOS,
  MAX_VIDEO_DURATION_SECONDS,
  type AllowedContentType,
} from "@dayli/contracts";

/** Matches Better Auth's own reset/verification token TTL precedent in this codebase. */
export const RESERVATION_TTL_SECONDS = 15 * 60;

/** Abuse guard, not a product-stated limit. Counts only reservations with expiresAt > now. */
export const MAX_PENDING_RESERVATIONS_PER_OWNER = 20;
