import type { OpenAPIHono } from "@hono/zod-openapi";
import type { AuthenticatedApiEnv } from "../../http/authenticated-actor";
import { registerCreateDailyPostRoute, type CreateDailyPostRouteDependencies } from "./create-post/create-post.route";
import { registerGetPostRoute, type GetPostRouteDependencies } from "./get-post/get-post.route";
import {
  registerGetPostVoiceMemoRoute,
  type GetPostVoiceMemoRouteDependencies,
} from "./get-post-voice-memo/get-post-voice-memo.route";
import { registerGetPostMediaRoute, type GetPostMediaRouteDependencies } from "./get-post-media/get-post-media.route";
import { registerGetProfileMoodRoute, type GetProfileMoodRouteDependencies } from "./get-profile-mood/get-profile-mood.route";
import { registerListFeedRoute, type ListFeedRouteDependencies } from "./list-feed/list-feed.route";
import { registerListPostRevisionsRoute, type ListPostRevisionsRouteDependencies } from "./list-post-revisions/list-post-revisions.route";
import { registerListProfilePostsRoute, type ListProfilePostsRouteDependencies } from "./list-profile-posts/list-profile-posts.route";
import { registerPostTrashRoutes, type PostTrashRouteDependencies } from "./trash-post/trash-post.route";
import { registerUpdatePostRoute, type UpdatePostRouteDependencies } from "./update-post/update-post.route";

export interface PostsRouteDependencies {
  create: CreateDailyPostRouteDependencies;
  feed: ListFeedRouteDependencies;
  detail: GetPostRouteDependencies;
  media: GetPostMediaRouteDependencies;
  voiceMemo: GetPostVoiceMemoRouteDependencies;
  profilePosts: ListProfilePostsRouteDependencies;
  trash: PostTrashRouteDependencies;
  update: UpdatePostRouteDependencies;
  revisions: ListPostRevisionsRouteDependencies;
  profileMood: GetProfileMoodRouteDependencies;
}

/** Register post actions without embedding post policy in the composition root. */
export function registerPostsRoutes(app: OpenAPIHono<AuthenticatedApiEnv>, dependencies: PostsRouteDependencies) {
  registerCreateDailyPostRoute(app, dependencies.create);
  registerListFeedRoute(app, dependencies.feed);
  // Register this static path before the dynamic /posts/:postId detail path.
  registerPostTrashRoutes(app, dependencies.trash);
  registerGetPostRoute(app, dependencies.detail);
  registerGetPostMediaRoute(app, dependencies.media);
  registerGetPostVoiceMemoRoute(app, dependencies.voiceMemo);
  registerListProfilePostsRoute(app, dependencies.profilePosts);
  registerGetProfileMoodRoute(app, dependencies.profileMood);
  registerUpdatePostRoute(app, dependencies.update);
  registerListPostRevisionsRoute(app, dependencies.revisions);
}
