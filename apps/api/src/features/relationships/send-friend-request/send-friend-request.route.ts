import { createRoute } from "@hono/zod-openapi";
import { relationshipErrorResponses, relationshipStatusSchema, sendRelationshipRequestBodySchema } from "../relationships.contract";
import { relationshipSecurity, relationshipServiceError, type RelationshipRouteApp, type RelationshipsRouteDependencies } from "../shared/relationship-route";

const route = createRoute({
  method: "post",
  path: "/api/v1/relationships/requests",
  tags: ["Relationships"],
  operationId: "relationships.sendRequest",
  summary: "Send a relationship request",
  security: relationshipSecurity,
  request: { body: { content: { "application/json": { schema: sendRelationshipRequestBodySchema } } } },
  responses: {
    201: { description: "The pending relationship request was created.", content: { "application/json": { schema: relationshipStatusSchema } } },
    ...relationshipErrorResponses,
  },
});

export function registerSendFriendRequestRoute(app: RelationshipRouteApp, dependencies: RelationshipsRouteDependencies) {
  app.openapi(route, async (context) => {
    const { recipientId } = context.req.valid("json");
    try {
      return context.json(await dependencies.service.sendRequest(context.get("actor").userId, recipientId), 201);
    } catch (error) {
      return relationshipServiceError(context, error);
    }
  });
}
