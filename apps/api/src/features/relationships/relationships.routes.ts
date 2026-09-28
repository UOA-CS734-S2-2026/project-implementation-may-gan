import type { OpenAPIHono } from "@hono/zod-openapi";
import type { AuthenticatedApiEnv } from "../../http/authenticated-actor";
import { createRequireSession } from "../../http/middleware/require-session";
import { registerAcceptFriendRequestRoute } from "./accept-friend-request/accept-friend-request.route";
import { registerBlockUserRoute } from "./block-user/block-user.route";
import { registerCancelFriendRequestRoute } from "./cancel-friend-request/cancel-friend-request.route";
import { registerDeclineFriendRequestRoute } from "./decline-friend-request/decline-friend-request.route";
import { registerGetRelationshipRoute } from "./get-relationship/get-relationship.route";
import { registerListFriendRequestsRoute } from "./list-friend-requests/list-friend-requests.route";
import { registerRemoveFriendshipRoute } from "./remove-friendship/remove-friendship.route";
import { registerSendFriendRequestRoute } from "./send-friend-request/send-friend-request.route";
import { registerUnblockUserRoute } from "./unblock-user/unblock-user.route";
import type { RelationshipsRouteDependencies } from "./shared/relationship-route";

export type { RelationshipsRouteDependencies } from "./shared/relationship-route";

/** Register feature actions without embedding relationship policy in the composition root. */
export function registerRelationshipsRoutes(
  app: OpenAPIHono<AuthenticatedApiEnv>,
  dependencies: RelationshipsRouteDependencies,
) {
  app.openAPIRegistry.registerComponent("securitySchemes", "BearerAuth", {
    type: "http",
    scheme: "bearer",
    bearerFormat: "Dayli session token",
  });
  app.openAPIRegistry.registerComponent("securitySchemes", "cookieAuth", {
    type: "apiKey",
    in: "cookie",
    name: "better-auth.session_token",
    description: "Browser clients may authenticate with the Better Auth secure session cookie.",
  });
  app.use("/api/v1/relationships/*", async (context, next) => {
    try {
      await next();
    } finally {
      context.header("Cache-Control", "no-store");
    }
  });
  app.use("/api/v1/relationships/*", createRequireSession(dependencies.resolveSession));

  registerListFriendRequestsRoute(app, dependencies);
  registerGetRelationshipRoute(app, dependencies);
  registerSendFriendRequestRoute(app, dependencies);
  registerAcceptFriendRequestRoute(app, dependencies);
  registerDeclineFriendRequestRoute(app, dependencies);
  registerCancelFriendRequestRoute(app, dependencies);
  registerRemoveFriendshipRoute(app, dependencies);
  registerBlockUserRoute(app, dependencies);
  registerUnblockUserRoute(app, dependencies);
}
