import { OpenAPIHono } from "@hono/zod-openapi";
import type { AuthenticatedApiEnv, OptionalAuthenticatedApiEnv } from "../../http/authenticated-actor";
import { registerCreateDailyPostRoute, type CreateDailyPostRouteDependencies } from "./create-post/create-post.route";
import { registerGetPostRoute, type GetPostRouteDependencies } from "./get-post/get-post.route";
import {
  registerGetPostVoiceMemoRoute,
  type GetPostVoiceMemoRouteDependencies,
} from "./get-post-voice-memo/get-post-voice-memo.route";
import { registerGetPostMediaRoute, type GetPostMediaRouteDependencies } from "./get-post-media/get-post-media.route";
import { registerListFeedRoute, type ListFeedRouteDependencies } from "./list-feed/list-feed.route";
import { registerListProfilePostsRoute, type ListProfilePostsRouteDependencies } from "./list-profile-posts/list-profile-posts.route";
import { registerPostTrashRoutes, type PostTrashRouteDependencies } from "./trash-post/trash-post.route";

export interface PostsRouteDependencies {
  create: CreateDailyPostRouteDependencies;
  feed: ListFeedRouteDependencies;
  detail: GetPostRouteDependencies;
  media: GetPostMediaRouteDependencies;
  voiceMemo: GetPostVoiceMemoRouteDependencies;
  profilePosts: ListProfilePostsRouteDependencies;
  trash: PostTrashRouteDependencies;
}

/** Register post actions without embedding post policy in the composition root. */
export function registerPostsRoutes(app: OpenAPIHono<AuthenticatedApiEnv>, dependencies: PostsRouteDependencies) {
  registerCreateDailyPostRoute(app, dependencies.create);
  registerListFeedRoute(app, dependencies.feed);
  // Register this static path before the dynamic /posts/:postId detail path.
  registerPostTrashRoutes(app, dependencies.trash);
  const publicPostReads = new OpenAPIHono<OptionalAuthenticatedApiEnv>();
  registerGetPostRoute(publicPostReads, dependencies.detail);
  app.route("/", publicPostReads);
  registerGetPostMediaRoute(app, dependencies.media);
  registerGetPostVoiceMemoRoute(app, dependencies.voiceMemo);
  registerListProfilePostsRoute(app, dependencies.profilePosts);
}
