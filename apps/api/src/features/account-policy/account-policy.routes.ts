import { createRoute, z, type OpenAPIHono } from "@hono/zod-openapi";
import { apiErrorSchema } from "@dayli/contracts";
import { apiErrorResponse } from "../../http/api-error";
import type { AuthenticatedApiEnv } from "../../http/authenticated-actor";
import { actionableAccountCapabilities } from "./shared/account-policy";
import type { AccountPolicyResolver } from "./shared/account-policy.middleware";

export interface AccountPolicyRouteDependencies {
  policies?: AccountPolicyResolver;
  usernameStore?: { get(userId: string): Promise<{ needsUsernameSetup: boolean } | null> };
}

const bootstrapSchema = z.object({
  restriction: z.string(),
  allowed: z.array(z.string()),
  onboarding: z.object({
    legalAcceptanceRequired: z.boolean(),
    usernameSetupRequired: z.boolean(),
  }),
}).openapi("AccountBootstrap");

const bootstrapRoute = createRoute({
  method: "get",
  path: "/api/v1/account/bootstrap",
  tags: ["Account"],
  operationId: "getAccountBootstrap",
  security: [{ BearerAuth: [] }, { cookieAuth: [] }],
  responses: {
    200: { description: "Session-scoped UI access state, not an authorisation credential.", content: { "application/json": { schema: bootstrapSchema } } },
    401: { description: "Authentication required.", content: { "application/json": { schema: apiErrorSchema } } },
    403: { description: "Account access denied.", content: { "application/json": { schema: apiErrorSchema } } },
    503: { description: "Account state unavailable.", content: { "application/json": { schema: apiErrorSchema } } },
  },
});

/** Content-free access reads. No legal documents, deadlines, or operator cases. */
export function registerAccountPolicyRoutes(
  app: OpenAPIHono<AuthenticatedApiEnv>,
  dependencies: AccountPolicyRouteDependencies,
) {
  for (const path of ["/api/v1/account/status", "/api/v1/account/policy"]) {
    app.get(path, async (context) => {
      context.header("Cache-Control", "no-store");
      const actor = context.get("actor");
      if (!actor?.userId) return apiErrorResponse(context, 401, "UNAUTHENTICATED", "Authentication is required.");
      if (!dependencies.policies) return apiErrorResponse(context, 503, "SERVICE_UNAVAILABLE", "Account policy is temporarily unavailable.");
      try {
        const policy = context.get("accountPolicy") ?? await dependencies.policies.resolve(actor.userId);
        return context.json({ restriction: policy.restriction, allowed: actionableAccountCapabilities(policy) }, 200);
      } catch {
        return apiErrorResponse(context, 503, "SERVICE_UNAVAILABLE", "Account policy is temporarily unavailable.");
      }
    });
  }

  app.openapi(bootstrapRoute, async (context) => {
    context.header("Cache-Control", "no-store");
    const actor = context.get("actor");
    if (!actor?.userId) return apiErrorResponse(context, 401, "UNAUTHENTICATED", "Authentication is required.") as never;
    if (!dependencies.policies || !dependencies.usernameStore) return apiErrorResponse(context, 503, "SERVICE_UNAVAILABLE", "Account state is temporarily unavailable.") as never;
    try {
      const policy = context.get("accountPolicy") ?? await dependencies.policies.resolve(actor.userId);
      const profile = await dependencies.usernameStore.get(actor.userId);
      if (!profile) return apiErrorResponse(context, 401, "UNAUTHENTICATED", "Authentication is required.") as never;
      return context.json({
        restriction: policy.restriction,
        allowed: [
          ...actionableAccountCapabilities(policy),
          ...(["export", "cancel_deletion_verification"] as const).filter((capability) => policy.allowed.has(capability)),
        ],
        onboarding: {
          legalAcceptanceRequired: policy.restriction === "terms_blocked" || policy.restriction === "age_declaration_blocked",
          usernameSetupRequired: profile.needsUsernameSetup,
        },
      }, 200);
    } catch {
      return apiErrorResponse(context, 503, "SERVICE_UNAVAILABLE", "Account state is temporarily unavailable.") as never;
    }
  });
}
