import {
  apiErrorSchema,
  cursorPaginationQuerySchema,
  paginatedResponseSchema,
  utcTimestampSchema,
} from "@dayli/contracts";
import { z } from "@hono/zod-openapi";
import { rateLimitErrorResponse } from "../../../http/rate-limit-contract";
import { postAudienceSchema } from "../shared/post-content.contract";

export const postRevisionsQuerySchema = cursorPaginationQuerySchema.openapi("PostRevisionsQuery");

export const postRevisionSchema = z
  .object({
    revisionNumber: z.number().int().min(1).openapi({ description: "1 is the version first posted." }),
    reflectiveAnswer: z.string(),
    caption: z.string().nullable(),
    rating: z.number().int(),
    audience: postAudienceSchema,
    replacedAt: utcTimestampSchema,
  })
  .openapi("PostRevision", {
    description: "An earlier version of a post, which an edit replaced at `replacedAt`. The prompt, day and media are the same as the current post.",
  });

export const postRevisionsPageSchema = paginatedResponseSchema(postRevisionSchema).openapi("PostRevisionsPage");

export const listPostRevisionsErrorResponses = {
  401: {
    description: "Authentication is required.",
    content: { "application/json": { schema: apiErrorSchema } },
  },
  404: {
    description: "The post does not exist or the caller may not read it. The two cases are indistinguishable.",
    content: { "application/json": { schema: apiErrorSchema } },
  },
  422: {
    description: "The post ID or query contains invalid values, including an unrecognised cursor.",
    content: { "application/json": { schema: apiErrorSchema } },
  },
  429: rateLimitErrorResponse,
  503: {
    description: "Post storage is temporarily unavailable.",
    content: { "application/json": { schema: apiErrorSchema } },
  },
};

export type PostRevision = z.infer<typeof postRevisionSchema>;
export type PostRevisionsPage = z.infer<typeof postRevisionsPageSchema>;
