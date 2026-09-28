import { createRoute } from "@hono/zod-openapi";
import { relationshipErrorResponses, relationshipStatusSchema, relationshipUserParamsSchema } from "../relationships.contract";
import { relationshipSecurity, relationshipServiceError, type RelationshipRouteApp, type RelationshipsRouteDependencies } from "../shared/relationship-route";

const route = createRoute({
  method: "get",
  path: "/api/v1/relationships/{userId}",
  tags: ["Relationships"],
  operationId: "relationships.getStatus",
  summary: "Get relationship status with a user",
  security: relationshipSecurity,
  request: { params: relationshipUserParamsSchema },
  responses: {
    200: { description: "The relationship status from the authenticated user's perspective.", content: { "application/json": { schema: relationshipStatusSchema } } },
    ...relationshipErrorResponses,
  },
});

export function registerGetRelationshipRoute(app: RelationshipRouteApp, dependencies: RelationshipsRouteDependencies) {
  app.openapi(route, async (context) => {
    const { userId } = context.req.valid("param");
    try {
      return context.json(await dependencies.service.getStatus(context.get("actor").userId, userId), 200);
    } catch (error) {
      return relationshipServiceError(context, error);
    }
  });
}
