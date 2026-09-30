import { createRoute } from "@hono/zod-openapi";
import { relationshipErrorResponses, relationshipProfileSchema, usernameProfileParamsSchema } from "../shared/relationships.contract";
import { relationshipSecurity, relationshipServiceError, type RelationshipRouteApp, type RelationshipsRouteDependencies } from "../shared/relationship-route";

const route = createRoute({
  method: "get",
  path: "/api/v1/relationships/profiles/{username}",
  tags: ["Relationships"],
  operationId: "relationships.getProfileByUsername",
  summary: "Read a minimal social profile by username",
  description: "Returns only ID, username, chosen public display name, and actor relationship state. Unknown and blocked usernames are both not found.",
  security: relationshipSecurity,
  request: { params: usernameProfileParamsSchema },
  responses: { 200: { description: "Minimal privacy-safe profile.", content: { "application/json": { schema: relationshipProfileSchema } } }, ...relationshipErrorResponses },
});

export function registerGetProfileRoute(app: RelationshipRouteApp, dependencies: RelationshipsRouteDependencies) {
  app.openapi(route, async (context) => {
    try {
      return context.json(await dependencies.service.getProfileByUsername(context.get("actor").userId, context.req.valid("param").username), 200);
    } catch (error) {
      return relationshipServiceError(context, error);
    }
  });
}
