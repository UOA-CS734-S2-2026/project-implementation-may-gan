import { apiErrorSchema, opaqueIdSchema, utcTimestampSchema } from "@dayli/contracts";
import { z } from "@hono/zod-openapi";
import { rateLimitErrorResponse } from "../../../http/rate-limit-contract";

/** Mirrors the post_comments body check, which stays authoritative. */
export const COMMENT_MAX_CODE_POINTS = 1_000;

export const interactionPostParamsSchema = z.object({
  postId: opaqueIdSchema.openapi({ param: { name: "postId", in: "path" }, example: "post-1" }),
});

export const commentParamsSchema = interactionPostParamsSchema.extend({
  commentId: opaqueIdSchema.openapi({ param: { name: "commentId", in: "path" }, example: "comment-1" }),
});

/** Trimmed, non-empty text counted in Unicode code points, as the database counts it. */
export const commentTextSchema = z
  .string()
  .refine((value) => value.trim().length > 0, { message: "Must not be blank." })
  .refine((value) => value === value.trim(), { message: "Must not have leading or trailing whitespace." })
  .refine((value) => Array.from(value).length <= COMMENT_MAX_CODE_POINTS, {
    message: `Must be at most ${COMMENT_MAX_CODE_POINTS} characters.`,
  })
  .openapi({ example: "That sunset!" });

export const interactionPersonSchema = z
  .object({
    id: opaqueIdSchema,
    username: z.string().min(1),
    displayName: z.string().min(1),
  })
  .openapi("InteractionPerson");

export const postLikeSummarySchema = z
  .object({
    likeCount: z.number().int().min(0),
    viewerHasLiked: z.boolean(),
  })
  .openapi("PostLikeSummary");

export const postLikeSchema = z
  .object({
    person: interactionPersonSchema,
    likedAt: utcTimestampSchema,
  })
  .openapi("PostLike");

export const postCommentSchema = z
  .object({
    id: opaqueIdSchema,
    postId: opaqueIdSchema,
    parentCommentId: opaqueIdSchema.nullable().openapi({ description: "The top-level comment this replies to. Replies go one level deep." }),
    author: interactionPersonSchema,
    text: z.string(),
    createdAt: utcTimestampSchema,
    editedAt: utcTimestampSchema.nullable(),
    viewerCanEdit: z.boolean().openapi({ description: "True for the comment's author." }),
    viewerCanDelete: z.boolean().openapi({ description: "True for the comment's author and the post's author." }),
  })
  .openapi("PostComment");

export type InteractionPerson = z.infer<typeof interactionPersonSchema>;
export type PostLikeSummary = z.infer<typeof postLikeSummarySchema>;
export type PostLike = z.infer<typeof postLikeSchema>;
export type PostComment = z.infer<typeof postCommentSchema>;

const json = (description: string) => ({ description, content: { "application/json": { schema: apiErrorSchema } } });

/** Responses every interaction route shares. Routes add their own 409 or 422 detail. */
export const interactionErrorResponses = {
  401: json("Authentication is required."),
  404: json("The post does not exist or the caller may not read it. The two cases are indistinguishable."),
  422: json("The request contains invalid values."),
  429: rateLimitErrorResponse,
  503: json("Interaction storage is temporarily unavailable."),
};

export const commentErrorResponses = {
  ...interactionErrorResponses,
  404: json("The post or comment does not exist, or the caller may not read or change it. The cases are indistinguishable."),
};
