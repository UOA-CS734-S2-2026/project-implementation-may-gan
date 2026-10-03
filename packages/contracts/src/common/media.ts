import { z } from "@hono/zod-openapi";

/**
 * Photo and video types a post shows in `media`. Not pinned anywhere in
 * docs/dayli; covers default iOS and Android camera output.
 */
export const visualContentTypes = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "video/mp4",
  "video/quicktime",
] as const;

/**
 * Audio types, used by voice memos. AAC in an MP4 (m4a) file: both phone platforms record
 * it natively and every browser and phone plays it.
 */
export const audioContentTypes = ["audio/mp4"] as const;

/** Everything a client may upload. Audio is linked to a post separately from `media`. */
export const allowedContentTypes = [...visualContentTypes, ...audioContentTypes] as const;

export type VisualContentType = (typeof visualContentTypes)[number];
export type AudioContentType = (typeof audioContentTypes)[number];
export type AllowedContentType = (typeof allowedContentTypes)[number];

export function isAudioContentType(contentType: string): contentType is AudioContentType {
  return (audioContentTypes as readonly string[]).includes(contentType);
}

/** Used by media reservations, which accept audio too. */
export const mediaContentTypeSchema = z.enum(allowedContentTypes).openapi("MediaContentType");

/**
 * Used by a post's `media`, which never holds audio. A separate schema keeps
 * the values a shipped client has to decode there unchanged.
 */
export const postMediaContentTypeSchema = z.enum(visualContentTypes).openapi("PostMediaContentType");

/** Voice memos are shown by `voiceMemo` on a post. */
export const voiceMemoContentTypeSchema = z.enum(audioContentTypes).openapi("VoiceMemoContentType");

/** Per photo or video attachment. Pinned by docs/dayli/product-decisions.md and docs/dayli/mvp.md. */
export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;

/** Pinned by docs/dayli/product-decisions.md and docs/dayli/mvp.md. Enforced by issue #23's completion check. */
export const MAX_VIDEO_DURATION_SECONDS = 15;

/** A post holds up to this many photos, or exactly one video, never both. Pinned by docs/dayli/product-decisions.md. */
export const MAX_POST_PHOTOS = 3;

/** Per post. Pinned by docs/dayli/product-decisions.md and docs/dayli/mvp.md. */
export const MAX_POST_MEDIA_BYTES = 25 * 1024 * 1024;

/** Per voice memo. A minute of AAC speech is about 1 MB; 2 MB leaves room for higher bitrates. */
export const MAX_VOICE_MEMO_BYTES = 2 * 1024 * 1024;

/** One voice memo. Enforced by the completion check, strictly. */
export const MAX_VOICE_MEMO_SECONDS = 60;

/** A post holds at most one voice memo, alongside its photos or video. */
export const MAX_POST_VOICE_MEMOS = 1;
