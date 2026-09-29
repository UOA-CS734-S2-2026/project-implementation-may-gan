import { createRoute, type OpenAPIHono } from "@hono/zod-openapi";
import type { Context } from "hono";
import type { AuthenticatedApiEnv } from "../../../http/authenticated-actor";
import { apiErrorResponse } from "../../../http/api-error";
import { createRequireSession, type ResolveSession } from "../../../http/middleware/require-session";
import { usernameErrorResponses, usernameProfileSchema, usernameSetupRequestSchema, type UsernameProfile } from "./username.contract";
import type { UsernameProfileStore } from "./username.repository";

export interface UsernameProfileRouteDependencies {
  resolveSession: ResolveSession;
  store?: UsernameProfileStore;
}

const security: Array<Record<string, string[]>> = [{ BearerAuth: [] }, { cookieAuth: [] }];
const path = "/api/v1/profile/username";

const getUsernameProfileRoute = createRoute({
  method: "get", path, tags: ["Profile"], operationId: "profile.getUsername",
  summary: "Get username setup state", security,
  responses: { 200: { description: "The authenticated account's public identity state.", content: { "application/json": { schema: usernameProfileSchema } } }, ...usernameErrorResponses },
});

const claimUsernameRoute = createRoute({
  method: "post", path, tags: ["Profile"], operationId: "profile.claimInitialUsername",
  summary: "Claim an initial username", description: "Completes the one-time required username setup for the authenticated account. It never renames an established handle.", security,
  request: { body: { required: true, content: { "application/json": { schema: usernameSetupRequestSchema } } } },
  responses: { 200: { description: "The established public identity.", content: { "application/json": { schema: usernameProfileSchema } } }, ...usernameErrorResponses },
});

function unavailable(context: Context) {
  return apiErrorResponse(context, 503, "SERVICE_UNAVAILABLE", "Profile storage is temporarily unavailable.") as never;
}

export function registerUsernameProfileRoutes(app: OpenAPIHono<AuthenticatedApiEnv>, dependencies: UsernameProfileRouteDependencies) {
  app.use(path, createRequireSession(dependencies.resolveSession));
  app.openapi(getUsernameProfileRoute, async (context) => {
    context.header("Cache-Control", "no-store");
    if (!dependencies.store) return unavailable(context);
    const result = await dependencies.store.get(context.get("actor").userId);
    return result ? context.json(result, 200) : apiErrorResponse(context, 401, "UNAUTHENTICATED", "Authentication is required.") as never;
  });
  app.openapi(claimUsernameRoute, async (context) => {
    context.header("Cache-Control", "no-store");
    if (!dependencies.store) return unavailable(context);
    const actor = context.get("actor").userId;
    const outcome = await dependencies.store.claimInitial(actor, context.req.valid("json"));
    if (outcome === "taken") return apiErrorResponse(context, 409, "CONFLICT", "That username is already taken.") as never;
    if (outcome !== "claimed") return apiErrorResponse(context, outcome === "missing" ? 401 : 409, outcome === "missing" ? "UNAUTHENTICATED" : "CONFLICT", outcome === "missing" ? "Authentication is required." : "Username setup is already complete.") as never;
    const profile = await dependencies.store.get(actor);
    if (!profile) return apiErrorResponse(context, 401, "UNAUTHENTICATED", "Authentication is required.") as never;
    return context.json(profile, 200);
  });
}
