import type { OpenAPIHono } from "@hono/zod-openapi";
import type { AuthenticatedApiEnv } from "../../http/authenticated-actor";
import { apiErrorResponse } from "../../http/api-error";
import type { AccountPolicyResolver } from "./shared/account-policy.middleware";

export interface AccountPolicyRouteDependencies {
  policies?: AccountPolicyResolver;
}

/**
 * This is a read-only restricted-state response. It deliberately exposes no
 * deadline, legal document, operator-case, or profile data. Future mutation,
 * cancellation verification, and export routes must each use explicit grants.
 */
export function registerAccountPolicyRoutes(
  app: OpenAPIHono<AuthenticatedApiEnv>,
  dependencies: AccountPolicyRouteDependencies,
) {
  app.get("/api/v1/account/status", async (context) => {
    const actor = context.get("actor");
    if (!actor?.userId) return apiErrorResponse(context, 401, "UNAUTHENTICATED", "Authentication is required.");
    if (!dependencies.policies) return apiErrorResponse(context, 503, "SERVICE_UNAVAILABLE", "Account policy is temporarily unavailable.");
    try {
      const policy = await dependencies.policies.resolve(actor.userId);
      return context.json({ restriction: policy.restriction, allowed: [...policy.allowed].sort() }, 200);
    } catch {
      return apiErrorResponse(context, 503, "SERVICE_UNAVAILABLE", "Account policy is temporarily unavailable.");
    }
  });
  app.get("/api/v1/account/policy", async (context) => {
    const actor = context.get("actor");
    if (!actor?.userId) return apiErrorResponse(context, 401, "UNAUTHENTICATED", "Authentication is required.");
    if (!dependencies.policies) return apiErrorResponse(context, 503, "SERVICE_UNAVAILABLE", "Account policy is temporarily unavailable.");
    try {
      const policy = await dependencies.policies.resolve(actor.userId);
      return context.json({ restriction: policy.restriction, allowed: [...policy.allowed].sort() }, 200);
    } catch {
      return apiErrorResponse(context, 503, "SERVICE_UNAVAILABLE", "Account policy is temporarily unavailable.");
    }
  });
}
