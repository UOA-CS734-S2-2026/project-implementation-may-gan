/**
 * Media policy. Per-attachment size and type are checked at reservation time;
 * the per-post limits below are checked when post creation links validated
 * uploads to a post (see the create-post service).
 */

/** Matches Better Auth's own reset/verification token TTL precedent in this codebase. */
export const RESERVATION_TTL_SECONDS = 15 * 60;

/** Abuse guard, not a product-stated limit. Counts only reservations with expiresAt > now. */
export const MAX_PENDING_RESERVATIONS_PER_OWNER = 20;

/** Pinned by docs/dayli/product-decisions.md and docs/dayli/mvp.md. */
export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;

/** Pinned by docs/dayli/product-decisions.md and docs/dayli/mvp.md. Enforced by issue #23's completion check. */
export const MAX_VIDEO_DURATION_SECONDS = 15;

/** A post holds up to this many photos, or exactly one video, never both. Pinned by docs/dayli/product-decisions.md. */
export const MAX_POST_PHOTOS = 3;

/** Pinned by docs/dayli/product-decisions.md and docs/dayli/mvp.md. */
export const MAX_POST_MEDIA_BYTES = 25 * 1024 * 1024;

/**
 * Not pinned anywhere in docs/dayli — covers default iOS/Android camera output.
 * Exported as a plain array so issue #63 (audio attachments) can extend it
 * additively without touching reservation logic.
 */
export const allowedContentTypes = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "video/mp4",
  "video/quicktime",
] as const;

export type AllowedContentType = (typeof allowedContentTypes)[number];
