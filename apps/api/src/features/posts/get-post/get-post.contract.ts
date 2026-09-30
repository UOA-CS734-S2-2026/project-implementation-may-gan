import {
  apiErrorSchema,
  aucklandDateSchema,
  opaqueIdSchema,
  utcTimestampSchema,
} from "@dayli/contracts";
import { z } from "@hono/zod-openapi";
import { rateLimitErrorResponse } from "../../../http/rate-limit-contract";

export const postIdParamsSchema = z.object({
  postId: opaqueIdSchema.openapi({ param: { name: "postId", in: "path" }, example: "post-1" }),
});

export const postDetailSchema = z
  .object({
    id: opaqueIdSchema,
    author: z.object({
      id: opaqueIdSchema,
      username: z.string().min(1),
      displayName: z.string().min(1),
    }).openapi("PostDetailAuthor"),
    localDate: aucklandDateSchema,
    prompt: z.object({
      id: opaqueIdSchema,
      text: z.string(),
    }).openapi("PostDetailPrompt", { description: "The prompt stored with the post, not the current day's prompt." }),
    reflectiveAnswer: z.string(),
    caption: z.string().nullable(),
    rating: z.number().int(),
    audience: z.enum(["solo", "friends"]),
    acceptedAt: utcTimestampSchema,
    releasedAt: utcTimestampSchema,
    edited: z.boolean().openapi({ description: "True when the author has edited the post since it was accepted." }),
    viewerIsAuthor: z.boolean(),
  })
  .openapi("PostDetail", {
    description: "One post the caller may read. Tomorrow notes and media are not part of this projection.",
  });

export const getPostErrorResponses = {
  401: {
    description: "Authentication is required.",
    content: { "application/json": { schema: apiErrorSchema } },
  },
  404: {
    description: "The post does not exist or the caller may not read it. The two cases are indistinguishable.",
    content: { "application/json": { schema: apiErrorSchema } },
  },
  422: {
    description: "The post ID is invalid.",
    content: { "application/json": { schema: apiErrorSchema } },
  },
  429: rateLimitErrorResponse,
  503: {
    description: "Post storage is temporarily unavailable.",
    content: { "application/json": { schema: apiErrorSchema } },
  },
};

export type PostDetail = z.infer<typeof postDetailSchema>;
