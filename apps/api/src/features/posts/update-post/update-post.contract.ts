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
    reflectiveAnswer: boundedText(DAILY_POST_LIMITS.reflectiveAnswerMaxCodePoints).optional()
      .openapi({ example: "Walked to the harbour after class, then home along the beach." }),
    caption: boundedText(DAILY_POST_LIMITS.captionMaxCodePoints).nullable().optional()
      .openapi({ description: "Null removes the caption.", example: "Sunset at the wharf" }),
    rating: z.number().int().min(DAILY_POST_LIMITS.ratingMin).max(DAILY_POST_LIMITS.ratingMax).optional()
      .openapi({ example: 8 }),
    audience: postAudienceSchema.optional(),
  })
  .strict()
  .refine(
    (body) => [body.reflectiveAnswer, body.caption, body.rating, body.audience].some((value) => value !== undefined),
    { message: "Change at least one field." },
  )
  .openapi("UpdatePostRequest", {
    description: "Fields left out stay unchanged. The prompt, day, media and tomorrow note cannot be edited.",
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
    description: "The post ID or a field is invalid, or no field was changed.",
    content: { "application/json": { schema: apiErrorSchema } },
  },
  429: rateLimitErrorResponse,
  503: {
    description: "Post storage is temporarily unavailable, or the post has media and media storage is unavailable.",
    content: { "application/json": { schema: apiErrorSchema } },
  },
};
