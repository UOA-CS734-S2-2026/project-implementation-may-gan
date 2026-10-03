import {
  apiErrorSchema,
  aucklandDateSchema,
  cursorPaginationQuerySchema,
  opaqueIdSchema,
  paginatedResponseSchema,
  utcTimestampSchema,
} from "@dayli/contracts";
import { z } from "@hono/zod-openapi";
import { rateLimitErrorResponse } from "../../../http/rate-limit-contract";

/** Mirrors the future_self_notes CHECK constraints in @dayli/db, which stay authoritative. */
export const FUTURE_SELF_NOTE_LIMITS = {
  bodyMaxCodePoints: 1_000,
  /** The latest delivery date is this many years after the current Auckland date. */
  maxYearsAhead: 10,
  idempotencyKeyMaxLength: 255,
} as const;

function codePoints(value: string): number {
  return Array.from(value).length;
}

/** Surrounding whitespace is trimmed, then 1 to 1,000 Unicode code points remain, as the database counts them. */
export const futureSelfNoteBodySchema = z
  .string()
  .trim()
  .min(1, { message: "Must not be blank." })
  .refine((value) => codePoints(value) <= FUTURE_SELF_NOTE_LIMITS.bodyMaxCodePoints, {
    message: `Must be at most ${FUTURE_SELF_NOTE_LIMITS.bodyMaxCodePoints} characters.`,
  })
  .openapi({
    description: "The note text, trimmed, 1 to 1,000 characters. It is never readable before its delivery date.",
    example: "I hope the thesis is submitted and you slept well.",
  });

export const futureSelfNoteDeliverOnSchema = aucklandDateSchema.openapi({
  description: "The Auckland calendar date the note is delivered on. When creating or rescheduling it must be from "
    + "tomorrow (Auckland, decided by the server) up to 10 years after today.",
  example: "2027-01-01",
});

export const futureSelfNoteStatusSchema = z.enum(["scheduled", "delivered"]).openapi("FutureSelfNoteStatus", {
  description: "`scheduled` until the delivery job records the note as delivered. A scheduled note becomes readable "
    + "on its Auckland date even before the job has run.",
});

export const createFutureSelfNoteRequestSchema = z
  .object({ body: futureSelfNoteBodySchema, deliverOn: futureSelfNoteDeliverOnSchema })
  .strict()
  .openapi("CreateFutureSelfNoteRequest");

export const updateFutureSelfNoteRequestSchema = z
  .object({ body: futureSelfNoteBodySchema.optional(), deliverOn: futureSelfNoteDeliverOnSchema.optional() })
  .strict()
  .refine((value) => value.body !== undefined || value.deliverOn !== undefined, { message: "Change at least one field." })
  .openapi("UpdateFutureSelfNoteRequest");

/** The note without its text. Used wherever the text might not be readable yet. */
export const futureSelfNoteSummarySchema = z
  .object({
    id: opaqueIdSchema,
    deliverOn: aucklandDateSchema,
    status: futureSelfNoteStatusSchema,
    deliveredAt: utcTimestampSchema.nullable(),
    createdAt: utcTimestampSchema,
    updatedAt: utcTimestampSchema,
  })
  .openapi("FutureSelfNote", { description: "A note to your future self, without its text." });

/** Only returned once the note's Auckland date has arrived. */
export const futureSelfNoteDetailSchema = futureSelfNoteSummarySchema
  .extend({ body: z.string().openapi({ description: "The note text. Present only on or after deliverOn." }) })
  .openapi("FutureSelfNoteDetail", { description: "A note to your future self whose date has arrived, with its text." });

export const futureSelfNotePageSchema = paginatedResponseSchema(futureSelfNoteSummarySchema)
  .openapi("FutureSelfNotePage");

export const listFutureSelfNotesQuerySchema = cursorPaginationQuerySchema.openapi("ListFutureSelfNotesQuery");

export const futureSelfNoteParamsSchema = z.object({
  noteId: opaqueIdSchema.openapi({ param: { name: "noteId", in: "path" } }),
});

export const idempotencyKeyHeaderSchema = z.object({
  "idempotency-key": z
    .string()
    .min(1)
    .max(FUTURE_SELF_NOTE_LIMITS.idempotencyKeyMaxLength)
    .regex(/^[\x21-\x7e]+$/, { message: "Must contain visible ASCII characters only." })
    .openapi({
      param: { name: "idempotency-key", in: "header" },
      description: "A client-generated key reused for every retry of this note, such as a UUID stored with the draft.",
      example: "0f8fad5b-d9cb-469f-a165-70867728950e",
    }),
});

const error = (description: string) => ({
  description,
  content: { "application/json": { schema: apiErrorSchema } },
});

export const futureSelfNoteSecurity: Array<Record<string, string[]>> = [{ BearerAuth: [] }, { cookieAuth: [] }];

/** Responses every future-self note operation can return. */
export const futureSelfNoteCommonErrors = {
  401: error("Authentication is required."),
  403: error("The account has not chosen a username (`details.reason` is absent), or is restricted. "
    + "A note read before its date is `NOTE_NOT_YET_AVAILABLE`."),
  429: rateLimitErrorResponse,
  503: error("Future-self note storage is temporarily unavailable."),
};

export const futureSelfNoteNotFound = error("The note does not exist or is not yours.");

export const futureSelfNoteValidationFailed = error(
  "The request contains invalid values. `details.reason` is `DELIVER_ON_OUT_OF_RANGE` when the date is not from tomorrow "
  + "(Auckland) up to 10 years ahead.",
);

export type CreateFutureSelfNoteRequest = z.infer<typeof createFutureSelfNoteRequestSchema>;
export type UpdateFutureSelfNoteRequest = z.infer<typeof updateFutureSelfNoteRequestSchema>;
export type FutureSelfNoteSummaryResponse = z.infer<typeof futureSelfNoteSummarySchema>;
export type FutureSelfNoteDetailResponse = z.infer<typeof futureSelfNoteDetailSchema>;
