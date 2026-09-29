import { createRoute } from "@hono/zod-openapi";
import { relationshipErrorResponses, relationshipStatusSchema, relationshipUserParamsSchema } from "../shared/relationships.contract";
import { relationshipSecurity, relationshipServiceError, type RelationshipRouteApp, type RelationshipsRouteDependencies } from "../shared/relationship-route";

const route = createRoute({ method: "delete", path: "/api/v1/relationships/{userId}/block", tags: ["Relationships"], operationId: "relationships.unblock", summary: "Unblock a user", security: relationshipSecurity, request: { params: relationshipUserParamsSchema }, responses: { 200: { description: "The relationship state after the transition.", content: { "application/json": { schema: relationshipStatusSchema } } }, ...relationshipErrorResponses } });

export function registerUnblockUserRoute(app: RelationshipRouteApp, dependencies: RelationshipsRouteDependencies) {
  app.openapi(route, async (context) => {
    try { return context.json(await dependencies.service.unblock(context.get("actor").userId, context.req.valid("param").userId), 200); }
    catch (error) { return relationshipServiceError(context, error); }
  });
}
