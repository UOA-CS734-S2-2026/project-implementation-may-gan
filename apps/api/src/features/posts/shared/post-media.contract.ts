import {
  voiceMemoContentTypeSchema,
  opaqueIdSchema,
  postMediaContentTypeSchema,
  utcTimestampSchema,
} from "@dayli/contracts";
import { z } from "@hono/zod-openapi";

/** OpenAPI 3.1 null member used by generated TypeScript and Dart clients. */
export const nullMember = z.never().openapi({ type: "null" }) as unknown as z.ZodType<null>;

/**
 * One attached photo or video as a reader sees it. The URL is either a short-lived
 * private link or an API route that checks the current parent on every request.
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
    expiresAt: z.union([utcTimestampSchema, nullMember]).openapi({
      description: "When a signed private URL stops working. Null for a Worker URL that reauthorizes every request.",
    }),
  })
  .openapi("PostMedia");

export type PostMedia = z.infer<typeof postMediaSchema>;

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
    expiresAt: z.union([utcTimestampSchema, nullMember]).openapi({
      description: "When a signed private URL stops working. Null for a Worker URL that reauthorizes every request.",
    }),
  });

/** Registered as its own non-null component: the refresh route returns it, and posts reference it. */
export const postVoiceMemoSchema = postVoiceMemoShape.openapi("PostVoiceMemo");

/** A post's voice memo, or null for a post without one. Required in the response. */
export const nullablePostVoiceMemoSchema = z.union([postVoiceMemoSchema, nullMember]);

export type PostVoiceMemo = z.infer<typeof postVoiceMemoSchema>;
