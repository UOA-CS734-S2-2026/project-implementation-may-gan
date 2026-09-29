import { createRoute } from "@hono/zod-openapi";
import { friendsQuerySchema, relationshipErrorResponses, relationshipUserPageSchema } from "../shared/relationships.contract";
import { relationshipSecurity, relationshipServiceError, type RelationshipRouteApp, type RelationshipsRouteDependencies } from "../shared/relationship-route";

const route = createRoute({
  method: "get",
  path: "/api/v1/relationships/friends",
  tags: ["Relationships"],
  operationId: "relationships.listFriends",
  summary: "List active friends",
  security: relationshipSecurity,
  request: { query: friendsQuerySchema },
  responses: {
    200: { description: "Minimal cards for active friends visible to the authenticated user.", content: { "application/json": { schema: relationshipUserPageSchema } } },
    ...relationshipErrorResponses,
  },
});

export function registerListFriendsRoute(app: RelationshipRouteApp, dependencies: RelationshipsRouteDependencies) {
  app.openapi(route, async (context) => {
    const { limit, cursor } = context.req.valid("query");
    try {
      return context.json(await dependencies.service.listFriends(context.get("actor").userId, limit, cursor), 200);
    } catch (error) {
      return relationshipServiceError(context, error);
    }
  });
}
