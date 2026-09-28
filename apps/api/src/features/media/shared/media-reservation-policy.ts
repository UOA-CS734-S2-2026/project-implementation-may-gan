/**
 * Reservation-time media policy. Per-attachment size/type are the only constraints
 * checkable at reservation time — the 3-attachments/25MB-per-post aggregate limits
 * from docs/dayli/product-decisions.md need a post/attachment-linkage entity that
 * doesn't exist yet, so they aren't enforced here.
 */

/** Matches Better Auth's own reset/verification token TTL precedent in this codebase. */
export const RESERVATION_TTL_SECONDS = 15 * 60;

/** Abuse guard, not a product-stated limit. Counts only reservations with expiresAt > now. */
export const MAX_PENDING_RESERVATIONS_PER_OWNER = 20;

/** Pinned by docs/dayli/product-decisions.md and docs/dayli/mvp.md. */
export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;

/** Pinned by docs/dayli/product-decisions.md and docs/dayli/mvp.md. Enforced by issue #23's completion check. */
export const MAX_VIDEO_DURATION_SECONDS = 15;

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
