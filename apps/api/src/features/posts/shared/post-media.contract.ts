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
 * `null` as a member of a union, written the way OpenAPI 3.1 expects (`{ "type": "null" }`).
 *
 * The document says 3.1.0, and the TypeScript and Dart generators read nullability from
 * a union with `null`; they ignore the 3.0 `nullable: true` that `.nullable()` emits, so
 * a nullable property would be generated as required and non-null, and decoding `null`
 * would throw. A `z.null()` member can't be used: the library then adds its own 3.0
 * `{ nullable: true }` branch, and an `anyOf` entry like that matches anything. The
 * member never validates at runtime, since responses aren't parsed with this schema; it
 * only describes `null` in the document, and is typed as `null`.
 */
export const nullMember = z.never().openapi({ type: "null" }) as unknown as z.ZodType<null>;

/**
 * A post's voice memo as a reader sees it. Like PostMedia,
 * the URL is a short-lived private download link for this viewer.
 */
export const postVoiceMemoShape = z
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
  });

/** Registered as its own non-null component: the refresh route returns it, and posts reference it. */
export const postVoiceMemoSchema = postVoiceMemoShape.openapi("PostVoiceMemo");

/** A post's voice memo, or null for a post without one. Required in the response. */
export const nullablePostVoiceMemoSchema = z.union([postVoiceMemoSchema, nullMember]);

export type PostVoiceMemo = z.infer<typeof postVoiceMemoSchema>;
