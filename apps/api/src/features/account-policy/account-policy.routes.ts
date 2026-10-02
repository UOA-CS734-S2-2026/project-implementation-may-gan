import type { OpenAPIHono } from "@hono/zod-openapi";
import { apiErrorResponse } from "../../http/api-error";
import type { AuthenticatedApiEnv } from "../../http/authenticated-actor";
import type { AccountPolicyResolver } from "./shared/account-policy.middleware";

export interface AccountPolicyRouteDependencies {
  policies?: AccountPolicyResolver;
}

/**
 * Content-free restricted-state reads. They intentionally disclose no deadline,
 * legal document, operator case, profile, or another account's state.
 */
export function registerAccountPolicyRoutes(
  app: OpenAPIHono<AuthenticatedApiEnv>,
  dependencies: AccountPolicyRouteDependencies,
) {
  app.get("/api/v1/account/status", async (context) => {
    context.header("Cache-Control", "no-store");
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
    context.header("Cache-Control", "no-store");
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
