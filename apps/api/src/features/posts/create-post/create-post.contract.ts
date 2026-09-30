import {
  apiErrorSchema,
  aucklandDateSchema,
  opaqueIdSchema,
  utcTimestampSchema,
} from "@dayli/contracts";
import { z } from "@hono/zod-openapi";
import { rateLimitErrorResponse } from "../../../http/rate-limit-contract";
import { MAX_POST_PHOTOS } from "../../media/shared/media-reservation-policy";
import { mediaContentTypeSchema } from "../../media/shared/media-reservation.contract";

/**
 * Mirrors DAILY_POST_CONTENT_LIMITS in @dayli/db. Contracts may not import the
 * database package, and the database CHECK constraints remain authoritative.
 */
export const DAILY_POST_LIMITS = {
  ratingMin: 1,
  ratingMax: 10,
  reflectiveAnswerMaxCodePoints: 4_000,
  captionMaxCodePoints: 1_000,
  tomorrowNoteMaxCodePoints: 1_000,
  idempotencyKeyMaxLength: 255,
} as const;

function codePoints(value: string): number {
  return Array.from(value).length;
}

/** Trimmed, non-empty text counted in Unicode code points, as the database counts it. */
function boundedText(maximum: number) {
  return z
    .string()
    .refine((value) => value.trim().length > 0, { message: "Must not be blank." })
    .refine((value) => value === value.trim(), { message: "Must not have leading or trailing whitespace." })
    .refine((value) => codePoints(value) <= maximum, { message: `Must be at most ${maximum} characters.` });
}

export const postAudienceSchema = z.enum(["solo", "friends"]).openapi("PostAudience");

export const createDailyPostRequestSchema = z
  .object({
    localDate: aucklandDateSchema.openapi({
      description: "The Auckland day the draft was written for. It must still be the server's current day when the post is accepted.",
    }),
    promptId: opaqueIdSchema.openapi({
      description: "The prompt ID returned by GET /api/v1/posting-days/current for localDate.",
      example: "prompt-09-25",
    }),
    reflectiveAnswer: boundedText(DAILY_POST_LIMITS.reflectiveAnswerMaxCodePoints)
      .openapi({ example: "Walked to the harbour after class." }),
    caption: boundedText(DAILY_POST_LIMITS.captionMaxCodePoints).optional()
      .openapi({ example: "Sunset at the wharf" }),
    rating: z.number().int().min(DAILY_POST_LIMITS.ratingMin).max(DAILY_POST_LIMITS.ratingMax)
      .openapi({ example: 7 }),
    audience: postAudienceSchema,
    tomorrowNote: boundedText(DAILY_POST_LIMITS.tomorrowNoteMaxCodePoints).optional().openapi({
      description: "An author-only note that becomes readable on the following Auckland day. It is never echoed back.",
      example: "Remember to bring the camera.",
    }),
    // An empty list means a text-only post: the generated Dart client always
    // sends this field, defaulting to [].
    attachments: z
      .array(opaqueIdSchema)
      .max(MAX_POST_PHOTOS)
      .refine((ids) => new Set(ids).size === ids.length, { message: "Must not repeat an attachment." })
      .optional()
      .openapi({
        description: "Validated media reservation IDs from POST /api/v1/media-reservations, in display order. "
          + "Up to 3 photos or 1 video, never both, up to 25 MB in total. Omit it or send an empty list for a text-only post.",
        example: ["0f8fad5b-d9cb-469f-a165-70867728950e"],
      }),
  })
  .strict()
  .openapi("CreateDailyPostRequest");

export const idempotencyKeyHeaderSchema = z.object({
  "idempotency-key": z
    .string()
    .min(1)
    .max(DAILY_POST_LIMITS.idempotencyKeyMaxLength)
    .regex(/^[\x21-\x7e]+$/, { message: "Must contain visible ASCII characters only." })
    .openapi({
      param: { name: "idempotency-key", in: "header" },
      description: "A client-generated key reused for every retry of this submission, such as a UUID stored with the draft.",
      example: "0f8fad5b-d9cb-469f-a165-70867728950e",
    }),
});

export const dailyPostSchema = z
  .object({
    id: opaqueIdSchema,
    authorId: opaqueIdSchema,
    localDate: aucklandDateSchema,
    prompt: z.object({
      id: opaqueIdSchema,
      text: z.string().openapi({ example: "What made you smile today?" }),
    }).openapi("DailyPostPrompt"),
    reflectiveAnswer: z.string(),
    caption: z.string().nullable(),
    rating: z.number().int(),
    audience: postAudienceSchema,
    acceptedAt: utcTimestampSchema,
    releasedAt: utcTimestampSchema,
    tomorrowNote: z
      .object({ availableOn: aucklandDateSchema })
      .nullable()
      .openapi({ description: "Present when a tomorrow note was submitted; its text is readable from availableOn." }),
    media: z
      .array(z.object({
        id: opaqueIdSchema,
        contentType: mediaContentTypeSchema,
        order: z.number().int().min(0),
      }).openapi("DailyPostMedia"))
      .openapi({ description: "The attached photos or video in display order. Empty for a text-only post." }),
  })
  .openapi("DailyPost");

export const createDailyPostConflictReasons = [
  "POSTING_DAY_CLOSED",
  "POSTING_DAY_NOT_OPEN",
  "PROMPT_CHANGED",
  "ALREADY_POSTED",
  "IDEMPOTENCY_KEY_REUSED",
  "MEDIA_NOT_READY",
  "MEDIA_UNAVAILABLE",
] as const;

export const createDailyPostErrorResponses = {
  401: {
    description: "Authentication is required.",
    content: { "application/json": { schema: apiErrorSchema } },
  },
  409: {
    description: "The posting day has closed or not yet opened, the prompt no longer matches, a post already exists for the day, the idempotency key was used for a different request, an attachment is still uploading (`MEDIA_NOT_READY`), or an attachment can't be used and must be uploaded again (`MEDIA_UNAVAILABLE`). `details.reason` identifies which.",
    content: { "application/json": { schema: apiErrorSchema } },
  },
  422: {
    description: "The request contains invalid values. `details.reason` is `MEDIA_NOT_ALLOWED` when the attachments mix photos and a video, include more than one video, or exceed 25 MB in total.",
    content: { "application/json": { schema: apiErrorSchema } },
  },
  429: rateLimitErrorResponse,
  503: {
    description: "Post storage is temporarily unavailable.",
    content: { "application/json": { schema: apiErrorSchema } },
  },
};

export type CreateDailyPostRequest = z.infer<typeof createDailyPostRequestSchema>;
export type DailyPostResponse = z.infer<typeof dailyPostSchema>;
