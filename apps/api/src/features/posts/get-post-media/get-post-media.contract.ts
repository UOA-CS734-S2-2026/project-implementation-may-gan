import { apiErrorSchema, opaqueIdSchema } from "@dayli/contracts";
import { z } from "@hono/zod-openapi";
import { rateLimitErrorResponse } from "../../../http/rate-limit-contract";

export const postMediaParamsSchema = z.object({
  postId: opaqueIdSchema.openapi({ param: { name: "postId", in: "path" }, example: "post-1" }),
  mediaId: opaqueIdSchema.openapi({ param: { name: "mediaId", in: "path" }, example: "media-1" }),
});

export const getPostMediaErrorResponses = {
  401: {
    description: "Authentication is required.",
    content: { "application/json": { schema: apiErrorSchema } },
  },
  404: {
    description: "The media is missing, detached, or on a post the caller may not read. These cases are not distinguished.",
    content: { "application/json": { schema: apiErrorSchema } },
  },
  422: {
    description: "The request contains invalid values.",
    content: { "application/json": { schema: apiErrorSchema } },
  },
  429: rateLimitErrorResponse,
  503: {
    description: "Post or media storage is temporarily unavailable.",
    content: { "application/json": { schema: apiErrorSchema } },
  },
};
