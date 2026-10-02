import { z } from "@hono/zod-openapi";

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
export function boundedText(maximum: number) {
  return z
    .string()
    .refine((value) => value.trim().length > 0, { message: "Must not be blank." })
    .refine((value) => value === value.trim(), { message: "Must not have leading or trailing whitespace." })
    .refine((value) => codePoints(value) <= maximum, { message: `Must be at most ${maximum} characters.` });
}

export const postAudienceSchema = z.enum(["solo", "friends"]).openapi("PostAudience");
