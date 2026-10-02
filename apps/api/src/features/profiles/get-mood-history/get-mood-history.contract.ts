import { apiErrorSchema, aucklandDateSchema } from "@dayli/contracts";
import { moodHistoryRanges } from "@dayli/domain";
import { z } from "@hono/zod-openapi";
import { rateLimitErrorResponse } from "../../../http/rate-limit-contract";

export const moodHistoryQuerySchema = z.object({
  range: z.enum(moodHistoryRanges).default("30d").openapi({
    param: { name: "range", in: "query" },
    description: "The last 30 days, 90 days, or 365 days, ending today in Auckland.",
    example: "30d",
  }),
}).openapi("MoodHistoryQuery");

const ratingSchema = z.number().int().min(1).max(10);

export const moodPeriodSummarySchema = z.object({
  from: aucklandDateSchema,
  to: aucklandDateSchema,
  trackedDays: z.number().int().nonnegative().openapi({ description: "Days in the period since the account's first day. Earlier days are not missing data." }),
  postedDays: z.number().int().nonnegative(),
  missingDays: z.number().int().nonnegative().openapi({ description: "Tracked days that ended without a post. Today is not missing while it is still open." }),
  average: z.number().nullable().openapi({ description: "Mean rating to one decimal place, or null with no posts." }),
  lowest: ratingSchema.nullable(),
  highest: ratingSchema.nullable(),
}).openapi("MoodPeriodSummary");

export const moodHistorySchema = z.object({
  range: z.enum(moodHistoryRanges),
  trackedFrom: aucklandDateSchema.openapi({ description: "The account's first Auckland day, or its earliest post if that is sooner." }),
  days: z.array(z.object({
    localDate: aucklandDateSchema,
    rating: ratingSchema,
  }).openapi("MoodDay")).openapi({ description: "Posted days in the current period, oldest first. Days without a post are left out." }),
  current: moodPeriodSummarySchema.openapi({ description: "The requested range, ending today." }),
  previous: moodPeriodSummarySchema.openapi({ description: "The same-length range just before it, for comparison." }),
}).openapi("MoodHistory", {
  description: "The caller's own ratings, including solo and unreleased posts. Deleted posts are left out.",
});

const error = (description: string) => ({ description, content: { "application/json": { schema: apiErrorSchema } } });

export const getMoodHistoryErrorResponses = {
  401: error("Authentication is required."),
  422: error("The range is not one of the supported values."),
  429: rateLimitErrorResponse,
  503: error("Post storage is temporarily unavailable."),
};

export type MoodHistoryResponse = z.infer<typeof moodHistorySchema>;
