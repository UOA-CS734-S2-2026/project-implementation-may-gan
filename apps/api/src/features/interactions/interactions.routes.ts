import type { OpenAPIHono } from "@hono/zod-openapi";
import type { AuthenticatedApiEnv } from "../../http/authenticated-actor";
import { registerCreatePostCommentRoute, type CreatePostCommentRouteDependencies } from "./create-post-comment/create-post-comment.route";
import { registerDeletePostCommentRoute, type DeletePostCommentRouteDependencies } from "./delete-post-comment/delete-post-comment.route";
import { registerLikePostRoute, type LikePostRouteDependencies } from "./like-post/like-post.route";
import { registerListPostCommentsRoute, type ListPostCommentsRouteDependencies } from "./list-post-comments/list-post-comments.route";
import { registerListPostLikesRoute, type ListPostLikesRouteDependencies } from "./list-post-likes/list-post-likes.route";
import { registerUnlikePostRoute, type UnlikePostRouteDependencies } from "./unlike-post/unlike-post.route";
import { registerUpdatePostCommentRoute, type UpdatePostCommentRouteDependencies } from "./update-post-comment/update-post-comment.route";

export interface InteractionsRouteDependencies {
  like: LikePostRouteDependencies;
  unlike: UnlikePostRouteDependencies;
  likes: ListPostLikesRouteDependencies;
  comments: ListPostCommentsRouteDependencies;
  createComment: CreatePostCommentRouteDependencies;
  updateComment: UpdatePostCommentRouteDependencies;
  deleteComment: DeletePostCommentRouteDependencies;
}

/** Register likes and comments; each action checks the post's visibility itself. */
export function registerInteractionsRoutes(app: OpenAPIHono<AuthenticatedApiEnv>, dependencies: InteractionsRouteDependencies) {
  registerLikePostRoute(app, dependencies.like);
  registerUnlikePostRoute(app, dependencies.unlike);
  registerListPostLikesRoute(app, dependencies.likes);
  registerListPostCommentsRoute(app, dependencies.comments);
  registerCreatePostCommentRoute(app, dependencies.createComment);
  registerUpdatePostCommentRoute(app, dependencies.updateComment);
  registerDeletePostCommentRoute(app, dependencies.deleteComment);
}
