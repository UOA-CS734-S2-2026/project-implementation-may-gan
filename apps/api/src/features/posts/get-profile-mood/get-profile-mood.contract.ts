import { apiErrorSchema, aucklandDateSchema } from "@dayli/contracts";
import { moodHistoryRanges } from "@dayli/domain";
import { z } from "@hono/zod-openapi";
import { rateLimitErrorResponse } from "../../../http/rate-limit-contract";

export const profileMoodParamsSchema = z.object({
  username: z.string().trim().min(2).max(32).regex(/^[a-zA-Z0-9_]+$/)
    .openapi({ param: { name: "username", in: "path" }, example: "ben" }),
});

export const profileMoodQuerySchema = z.object({
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
  postedDays: z.number().int().nonnegative().openapi({ description: "Days with a rating the caller can see." }),
  missingDays: z.number().int().nonnegative().openapi({ description: "Tracked days that ended without any post. A post the caller can't see is not missing, and today is not missing while it is still open." }),
  average: z.number().nullable().openapi({ description: "Mean visible rating to one decimal place, or null with none." }),
  lowest: ratingSchema.nullable(),
  highest: ratingSchema.nullable(),
}).openapi("MoodPeriodSummary");

export const moodHistorySchema = z.object({
  range: z.enum(moodHistoryRanges),
  trackedFrom: aucklandDateSchema.openapi({ description: "The account's first Auckland day, or its earliest post if that is sooner." }),
  days: z.array(z.object({
    localDate: aucklandDateSchema,
    rating: ratingSchema,
  }).openapi("MoodDay")).openapi({ description: "Rated days the caller can see in the current period, oldest first." }),
  hiddenDays: z.array(aucklandDateSchema).openapi({ description: "Days in the current period with a post the caller can't see, such as a solo post or today's post before midnight. They are not missing." }),
  current: moodPeriodSummarySchema.openapi({ description: "The requested range, ending today." }),
  previous: moodPeriodSummarySchema.openapi({ description: "The same-length range just before it, for comparison." }),
}).openapi("MoodHistory", {
  description: "A profile's daily ratings. The owner sees every post; an active friend sees released `friends` posts only.",
});

const error = (description: string) => ({ description, content: { "application/json": { schema: apiErrorSchema } } });

export const getProfileMoodErrorResponses = {
  401: error("Authentication is required."),
  403: error("Only the owner and their active friends can see this mood history."),
  404: error("The profile does not exist or is blocked in either direction. The cases are indistinguishable."),
  422: error("The username or range is invalid."),
  429: rateLimitErrorResponse,
  503: error("Post storage is temporarily unavailable."),
};

export type MoodHistoryResponse = z.infer<typeof moodHistorySchema>;
