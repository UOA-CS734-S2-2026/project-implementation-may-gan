import { paginatedResponseSchema } from "@dayli/contracts";
import type { z } from "@hono/zod-openapi";
import { postCommentSchema } from "../shared/interactions.contract";

export const postCommentsPageSchema = paginatedResponseSchema(postCommentSchema).openapi("PostCommentsPage", {
  description: "Comments and replies in the order they were written. A reply always comes after its top-level comment, so clients group replies under it as pages arrive.",
});
export type PostCommentsPage = z.infer<typeof postCommentsPageSchema>;
