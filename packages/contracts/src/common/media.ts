import { z } from "@hono/zod-openapi";

/**
 * Media types a client may upload. Not pinned anywhere in docs/dayli; covers
 * default iOS and Android camera output. A plain array so issue #63 (audio
 * attachments) can extend it additively.
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

/** Shared by media reservations and posts, so both describe one schema. */
export const mediaContentTypeSchema = z.enum(allowedContentTypes).openapi("MediaContentType");

/** Per attachment. Pinned by docs/dayli/product-decisions.md and docs/dayli/mvp.md. */
export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;

/** Pinned by docs/dayli/product-decisions.md and docs/dayli/mvp.md. Enforced by issue #23's completion check. */
export const MAX_VIDEO_DURATION_SECONDS = 15;

/** A post holds up to this many photos, or exactly one video, never both. Pinned by docs/dayli/product-decisions.md. */
export const MAX_POST_PHOTOS = 3;

/** Per post. Pinned by docs/dayli/product-decisions.md and docs/dayli/mvp.md. */
export const MAX_POST_MEDIA_BYTES = 25 * 1024 * 1024;
