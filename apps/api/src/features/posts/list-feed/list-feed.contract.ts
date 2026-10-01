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
import { postMediaSchema } from "../shared/post-media.contract";

export const feedQuerySchema = cursorPaginationQuerySchema.openapi("FeedQuery");

export const feedPostSchema = z
  .object({
    id: opaqueIdSchema,
    author: z.object({
      id: opaqueIdSchema,
      username: z.string().min(1),
      displayName: z.string().min(1),
    }).openapi("FeedPostAuthor"),
    localDate: aucklandDateSchema,
    prompt: z.object({
      id: opaqueIdSchema,
      text: z.string(),
    }).openapi("FeedPostPrompt"),
    reflectiveAnswer: z.string(),
    caption: z.string().nullable(),
    rating: z.number().int(),
    audience: z.enum(["friends"]).openapi({
      description: "Always `friends`: solo posts never appear in another user's feed.",
    }),
    acceptedAt: utcTimestampSchema,
    releasedAt: utcTimestampSchema,
    edited: z.boolean().openapi({ description: "True when the author has edited the post since it was accepted." }),
    media: z.array(postMediaSchema).openapi({
      description: "Attached photos or video in display order, each with a private download URL that expires after 5 minutes.",
    }),
  })
  .openapi("FeedPost", {
    description: "A released post from an active friend. Tomorrow notes are not part of the feed projection.",
  });

export const feedPageSchema = paginatedResponseSchema(feedPostSchema).openapi("FeedPage");

export const listFeedErrorResponses = {
  401: {
    description: "Authentication is required.",
    content: { "application/json": { schema: apiErrorSchema } },
  },
  422: {
    description: "The query contains invalid values, including an unrecognised cursor.",
    content: { "application/json": { schema: apiErrorSchema } },
  },
  429: rateLimitErrorResponse,
  503: {
    description: "The feed is temporarily unavailable, or the page has media and media storage is unavailable.",
    content: { "application/json": { schema: apiErrorSchema } },
  },
};

export type FeedPost = z.infer<typeof feedPostSchema>;
export type FeedPage = z.infer<typeof feedPageSchema>;
