import { createRoute } from "@hono/zod-openapi";
import { relationshipErrorResponses, relationshipRequestParamsSchema, relationshipStatusSchema } from "../shared/relationships.contract";
import { relationshipSecurity, relationshipServiceError, type RelationshipRouteApp, type RelationshipsRouteDependencies } from "../shared/relationship-route";

const route = createRoute({ method: "post", path: "/api/v1/relationships/requests/{requestId}/decline", tags: ["Relationships"], operationId: "relationships.declineRequest", summary: "Decline a pending relationship request", security: relationshipSecurity, request: { params: relationshipRequestParamsSchema }, responses: { 200: { description: "The relationship state after the request transition.", content: { "application/json": { schema: relationshipStatusSchema } } }, ...relationshipErrorResponses } });

export function registerDeclineFriendRequestRoute(app: RelationshipRouteApp, dependencies: RelationshipsRouteDependencies) {
  app.openapi(route, async (context) => {
    try { return context.json(await dependencies.service.declineRequest(context.get("actor").userId, context.req.valid("param").requestId), 200); }
    catch (error) { return relationshipServiceError(context, error); }
  });
}
