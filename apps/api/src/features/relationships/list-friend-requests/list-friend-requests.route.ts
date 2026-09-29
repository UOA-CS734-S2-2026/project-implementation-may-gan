import { createRoute } from "@hono/zod-openapi";
import { pendingRequestPageSchema, pendingRequestQuerySchema, relationshipErrorResponses } from "../shared/relationships.contract";
import { relationshipSecurity, relationshipServiceError, type RelationshipRouteApp, type RelationshipsRouteDependencies } from "../shared/relationship-route";

const route = createRoute({
  method: "get",
  path: "/api/v1/relationships/requests",
  tags: ["Relationships"],
  operationId: "relationships.listPendingRequests",
  summary: "List pending relationship requests",
  security: relationshipSecurity,
  request: { query: pendingRequestQuerySchema },
  responses: {
    200: { description: "Pending relationship requests visible to the authenticated user.", content: { "application/json": { schema: pendingRequestPageSchema } } },
    ...relationshipErrorResponses,
  },
});

export function registerListFriendRequestsRoute(app: RelationshipRouteApp, dependencies: RelationshipsRouteDependencies) {
  app.openapi(route, async (context) => {
    const { direction, limit, cursor } = context.req.valid("query");
    try {
      return context.json(await dependencies.service.listPendingRequests(context.get("actor").userId, direction, limit, cursor), 200);
    } catch (error) {
      return relationshipServiceError(context, error);
    }
  });
}
