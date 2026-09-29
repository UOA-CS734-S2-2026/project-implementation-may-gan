import type { OpenAPIHono } from "@hono/zod-openapi";
import type { AuthenticatedApiEnv } from "../../http/authenticated-actor";
import { registerCreateDailyPostRoute, type CreateDailyPostRouteDependencies } from "./create-post/create-post.route";
import { registerListFeedRoute, type ListFeedRouteDependencies } from "./list-feed/list-feed.route";

export interface PostsRouteDependencies {
  create: CreateDailyPostRouteDependencies;
  feed: ListFeedRouteDependencies;
}

/** Register post actions without embedding post policy in the composition root. */
export function registerPostsRoutes(app: OpenAPIHono<AuthenticatedApiEnv>, dependencies: PostsRouteDependencies) {
  registerCreateDailyPostRoute(app, dependencies.create);
  registerListFeedRoute(app, dependencies.feed);
}
