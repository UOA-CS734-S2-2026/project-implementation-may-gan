import { createRoute } from "@hono/zod-openapi";
import { relationshipErrorResponses, relationshipUserPageSchema, usernameSearchQuerySchema } from "../relationships.contract";
import { relationshipSecurity, relationshipServiceError, type RelationshipRouteApp, type RelationshipsRouteDependencies } from "../shared/relationship-route";

const route = createRoute({
  method: "get",
  path: "/api/v1/relationships/search",
  tags: ["Relationships"],
  operationId: "relationships.searchUsers",
  summary: "Search username prefixes",
  description: "Private accounts are discoverable here only as a minimal username/display-name card. This does not grant profile access.",
  security: relationshipSecurity,
  request: { query: usernameSearchQuerySchema },
  responses: {
    200: { description: "Minimal cards for matching discoverable accounts.", content: { "application/json": { schema: relationshipUserPageSchema } } },
    ...relationshipErrorResponses,
  },
});

export function registerSearchUsersRoute(app: RelationshipRouteApp, dependencies: RelationshipsRouteDependencies) {
  app.openapi(route, async (context) => {
    const { q, limit, cursor } = context.req.valid("query");
    try {
      return context.json(await dependencies.service.searchUsers(context.get("actor").userId, q, limit, cursor), 200);
    } catch (error) {
      return relationshipServiceError(context, error);
    }
  });
}
