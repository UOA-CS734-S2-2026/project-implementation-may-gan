import { apiErrorSchema } from "@dayli/contracts";
import { z } from "@hono/zod-openapi";
import { rateLimitErrorResponse } from "../../../http/rate-limit-contract";
import { boundedText, DAILY_POST_LIMITS, postAudienceSchema } from "../shared/post-content.contract";

export const updatePostRequestSchema = z
  .object({
    expectedRevisionCount: z.number().int().min(0).openapi({
      description: "The `revisionCount` of the post the author last read. If another edit has been saved since, the request is a 409.",
      example: 0,
    }),
    reflectiveAnswer: boundedText(DAILY_POST_LIMITS.reflectiveAnswerMaxCodePoints)
      .openapi({ example: "Walked to the harbour after class, then home along the beach." }),
    caption: boundedText(DAILY_POST_LIMITS.captionMaxCodePoints).nullable()
      .openapi({ description: "Null removes the caption.", example: "Sunset at the wharf" }),
    rating: z.number().int().min(DAILY_POST_LIMITS.ratingMin).max(DAILY_POST_LIMITS.ratingMax)
      .openapi({ example: 8 }),
    audience: postAudienceSchema,
  })
  .strict()
  .openapi("UpdatePostRequest", {
    description: "Every editable field, as the post should read after the edit. Only values that differ are saved, and only then is a revision stored. The prompt, day, media and tomorrow note cannot be edited.",
  });

export type UpdatePostRequest = z.infer<typeof updatePostRequestSchema>;
export type UpdatePostChanges = Omit<UpdatePostRequest, "expectedRevisionCount">;

export const updatePostErrorResponses = {
  401: {
    description: "Authentication is required.",
    content: { "application/json": { schema: apiErrorSchema } },
  },
  404: {
    description: "The post does not exist, was deleted, or belongs to someone else. The cases are indistinguishable.",
    content: { "application/json": { schema: apiErrorSchema } },
  },
  409: {
    description: "Another edit was saved after the caller read the post. Read it again and reapply the change.",
    content: { "application/json": { schema: apiErrorSchema } },
  },
  422: {
    description: "The post ID or a field is invalid, or a field is missing.",
    content: { "application/json": { schema: apiErrorSchema } },
  },
  429: rateLimitErrorResponse,
  503: {
    description: "Post storage is temporarily unavailable, or the post has media and media storage is unavailable.",
    content: { "application/json": { schema: apiErrorSchema } },
  },
};
