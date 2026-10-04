import { paginatedResponseSchema } from "@dayli/contracts";
import type { z } from "@hono/zod-openapi";
import { postLikeSchema } from "../shared/interactions.contract";

export const postLikesPageSchema = paginatedResponseSchema(postLikeSchema).openapi("PostLikesPage");
export type PostLikesPage = z.infer<typeof postLikesPageSchema>;
