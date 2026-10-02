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

export const profilePostsParamsSchema = z.object({
  username: z.string().trim().min(2).max(32).regex(/^[a-zA-Z0-9_]+$/)
    .openapi({ param: { name: "username", in: "path" }, example: "ben" }),
});

export const profilePostsQuerySchema = cursorPaginationQuerySchema.openapi("ProfilePostsQuery");

export const profilePostSchema = z
  .object({
    id: opaqueIdSchema,
    author: z.object({
      id: opaqueIdSchema,
      username: z.string().min(1),
      displayName: z.string().min(1),
    }).openapi("ProfilePostAuthor"),
    localDate: aucklandDateSchema,
    prompt: z.object({
      id: opaqueIdSchema,
      text: z.string(),
    }).openapi("ProfilePostPrompt"),
    reflectiveAnswer: z.string(),
    caption: z.string().nullable(),
    rating: z.number().int(),
    audience: z.enum(["solo", "friends"]).openapi({
      description: "`solo` appears only on the caller's own profile.",
    }),
    acceptedAt: utcTimestampSchema,
    releasedAt: utcTimestampSchema,
    released: z.boolean().openapi({
      description: "False only on the caller's own profile, for a post whose day has not been released yet.",
    }),
    edited: z.boolean().openapi({ description: "True when the author has edited the post since it was accepted." }),
    likeCount: z.number().int().min(0),
    viewerHasLiked: z.boolean(),
    commentCount: z.number().int().min(0).openapi({
      description: "Comments and replies the caller can see, leaving out deleted ones and people across a block.",
    }),
    media: z.array(postMediaSchema).openapi({
      description: "Attached photos or video in display order, each with a private download URL that expires after 5 minutes.",
    }),
  })
  .openapi("ProfilePost", {
    description: "One post on a profile. Tomorrow notes are not part of this projection.",
  });

export const profilePostsPageSchema = paginatedResponseSchema(profilePostSchema).openapi("ProfilePostsPage");

export const listProfilePostsErrorResponses = {
  401: {
    description: "Authentication is required.",
    content: { "application/json": { schema: apiErrorSchema } },
  },
  404: {
    description: "The profile does not exist or is blocked in either direction. The cases are indistinguishable.",
    content: { "application/json": { schema: apiErrorSchema } },
  },
  422: {
    description: "The username or query contains invalid values, including an unrecognised cursor.",
    content: { "application/json": { schema: apiErrorSchema } },
  },
  429: rateLimitErrorResponse,
  503: {
    description: "Post storage is temporarily unavailable, or the page has media and media storage is unavailable.",
    content: { "application/json": { schema: apiErrorSchema } },
  },
};

export type ProfilePost = z.infer<typeof profilePostSchema>;
export type ProfilePostsPage = z.infer<typeof profilePostsPageSchema>;
