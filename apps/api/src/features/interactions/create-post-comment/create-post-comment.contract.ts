import { apiErrorSchema, opaqueIdSchema } from "@dayli/contracts";
import { z } from "@hono/zod-openapi";
import { commentErrorResponses, commentTextSchema } from "../shared/interactions.contract";

export const createPostCommentRequestSchema = z
  .object({
    clientCommentId: z.string().min(1).max(255).regex(/^[\x21-\x7e]+$/, { message: "Must contain visible ASCII characters only." }).openapi({
      description: "A client-generated ID, such as a UUID, reused for every retry of this comment. A retry returns the comment already made.",
      example: "0f8fad5b-d9cb-469f-a165-70867728950e",
    }),
    text: commentTextSchema,
    parentCommentId: opaqueIdSchema.nullable().optional().openapi({
      description: "Replies to this top-level comment on the same post. Leave it out, or send null, for a top-level comment. Replies to replies are not allowed.",
    }),
  })
  .strict()
  .openapi("CreatePostCommentRequest");

export type CreatePostCommentRequest = z.infer<typeof createPostCommentRequestSchema>;

export const createPostCommentErrorResponses = {
  ...commentErrorResponses,
  404: {
    description: "The post does not exist or the caller may not read it. The two cases are indistinguishable.",
    content: { "application/json": { schema: apiErrorSchema } },
  },
  409: {
    description: "The `clientCommentId` was already used for a different comment.",
    content: { "application/json": { schema: apiErrorSchema } },
  },
  422: {
    description: "The text is invalid, or `parentCommentId` is not a visible top-level comment on this post.",
    content: { "application/json": { schema: apiErrorSchema } },
  },
};
