import { z } from "@hono/zod-openapi";
import { commentTextSchema } from "../shared/interactions.contract";

export const updatePostCommentRequestSchema = z
  .object({ text: commentTextSchema })
  .strict()
  .openapi("UpdatePostCommentRequest");
