import {
  voiceMemoContentTypeSchema,
  opaqueIdSchema,
  postMediaContentTypeSchema,
  utcTimestampSchema,
} from "@dayli/contracts";
import { z } from "@hono/zod-openapi";

/**
 * One attached photo or video as a reader sees it. The URL is a short-lived,
 * private download link for this viewer: never cache, log, or share it.
 */
export const postMediaSchema = z
  .object({
    id: opaqueIdSchema,
    contentType: postMediaContentTypeSchema,
    order: z.number().int().min(0),
    url: z.url().openapi({
      description: "A private download URL that expires at expiresAt. When media storage is unavailable, "
        + "a response that would include media is a 503 instead.",
    }),
    expiresAt: utcTimestampSchema.openapi({
      description: "When url stops working. Fetch the post again, or GET /api/v1/posts/{postId}/media/{mediaId}, for a fresh one.",
    }),
  })
  .openapi("PostMedia");

export type PostMedia = z.infer<typeof postMediaSchema>;

/**
 * A post's voice memo as a reader sees it. Like PostMedia,
 * the URL is a short-lived private download link for this viewer.
 */
export const postVoiceMemoSchema = z
  .object({
    id: opaqueIdSchema,
    contentType: voiceMemoContentTypeSchema,
    url: z.url().openapi({
      description: "A private download URL that expires at expiresAt. When media storage is unavailable, "
        + "a response that would include a voice memo is a 503 instead.",
    }),
    expiresAt: utcTimestampSchema.openapi({
      description: "When url stops working. Fetch the post again, or GET /api/v1/posts/{postId}/voice-memo, for a fresh one.",
    }),
  })
  .openapi("PostVoiceMemo");

export type PostVoiceMemo = z.infer<typeof postVoiceMemoSchema>;
