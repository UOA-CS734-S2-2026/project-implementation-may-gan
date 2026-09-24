/** Limits agreed for the daily-post content contract; posts are phase two. */
export const DAILY_POST_CONTENT_LIMITS = {
  ratingMin: 1,
  ratingMax: 10,
  reflectiveAnswerMaxCodePoints: 4_000,
  captionMaxCodePoints: 1_000,
  tomorrowNoteMaxCodePoints: 1_000,
} as const;

export const DAILY_POST_AUDIENCES = ["solo", "friends"] as const;
export type DailyPostAudience = (typeof DAILY_POST_AUDIENCES)[number];

export interface DailyPostContentInput {
  rating: unknown;
  reflectiveAnswer: unknown;
  caption?: unknown;
  tomorrowNote?: unknown;
  audience: unknown;
}

export type DailyPostContentField =
  | "rating"
  | "reflectiveAnswer"
  | "caption"
  | "tomorrowNote"
  | "audience";

export interface DailyPostContentIssue {
  field: DailyPostContentField;
  code: "required" | "type" | "integer" | "range" | "trimmed" | "too_long" | "enum";
}

export type DailyPostContentValidation =
  | { ok: true; value: DailyPostContentInput }
  | { ok: false; issues: DailyPostContentIssue[] };

function codePointLength(value: string): number {
  return Array.from(value).length;
}

function isAudience(value: unknown): value is DailyPostAudience {
  return typeof value === "string" && DAILY_POST_AUDIENCES.includes(value as DailyPostAudience);
}

/**
 * Validate the transport-independent content contract without depending on a
 * post table or route. Unicode code points, rather than UTF-16 code units,
 * are counted so emoji and other supplementary characters have one character
 * each as the product contract requires.
 */
export function validateDailyPostContent(input: unknown): DailyPostContentValidation {
  const issues: DailyPostContentIssue[] = [];
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return { ok: false, issues: [{ field: "reflectiveAnswer", code: "type" }] };
  }

  const value = input as Record<string, unknown>;
  const rating = value.rating;
  if (typeof rating !== "number") issues.push({ field: "rating", code: "type" });
  else if (!Number.isInteger(rating)) issues.push({ field: "rating", code: "integer" });
  else if (rating < DAILY_POST_CONTENT_LIMITS.ratingMin || rating > DAILY_POST_CONTENT_LIMITS.ratingMax) {
    issues.push({ field: "rating", code: "range" });
  }

  const reflectiveAnswer = value.reflectiveAnswer;
  if (typeof reflectiveAnswer !== "string") {
    issues.push({ field: "reflectiveAnswer", code: "required" });
  } else {
    if (reflectiveAnswer.trim().length === 0) issues.push({ field: "reflectiveAnswer", code: "required" });
    if (reflectiveAnswer !== reflectiveAnswer.trim()) issues.push({ field: "reflectiveAnswer", code: "trimmed" });
    if (codePointLength(reflectiveAnswer) > DAILY_POST_CONTENT_LIMITS.reflectiveAnswerMaxCodePoints) {
      issues.push({ field: "reflectiveAnswer", code: "too_long" });
    }
  }

  for (const [field, maximum] of [
    ["caption", DAILY_POST_CONTENT_LIMITS.captionMaxCodePoints],
    ["tomorrowNote", DAILY_POST_CONTENT_LIMITS.tomorrowNoteMaxCodePoints],
  ] as const) {
    const candidate = value[field];
    if (candidate !== undefined) {
      if (typeof candidate !== "string") issues.push({ field, code: "type" });
      else if (codePointLength(candidate) > maximum) issues.push({ field, code: "too_long" });
    }
  }

  if (!isAudience(value.audience)) issues.push({ field: "audience", code: "enum" });

  return issues.length === 0 ? { ok: true, value: input as DailyPostContentInput } : { ok: false, issues };
}
