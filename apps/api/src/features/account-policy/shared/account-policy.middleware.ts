import type { MiddlewareHandler } from "hono";
import { apiErrorResponse } from "../../../http/api-error";
import type { AuthenticatedActor, AuthenticatedApiEnv } from "../../../http/authenticated-actor";
import type { ResolveSession } from "../../../http/middleware/require-session";
import { allowsAccountCapability, type AccountCapability, type AccountPolicy } from "./account-policy";

export interface AccountPolicyResolver {
  resolve(userId: string): Promise<AccountPolicy>;
}

/** Every /api/v1 route is restrictive unless it is an exact reviewed exception. */
const publicApiRoutes = new Set([
  "GET /api/v1/health",
  "GET /api/v1/openapi.json",
  "GET /api/v1/test-contracts",
]);
const managementApiRoutes = new Map<string, AccountCapability>([
  ["GET /api/v1/account/status", "policy_read"],
  ["GET /api/v1/account/policy", "policy_read"],
]);

/**
 * Exact method and path matching prevents a future, unreviewed route or a
 * lookalike path from inheriting restricted-account access.
 */
export function accountCapabilityForRequest(request: Request): AccountCapability | undefined {
  const url = new URL(request.url);
  const key = `${request.method.toUpperCase()} ${url.pathname}`;
  if (publicApiRoutes.has(key)) return undefined;
  return managementApiRoutes.get(key) ?? "ordinary";
}

function restrictedResponse(context: Parameters<MiddlewareHandler<AuthenticatedApiEnv>>[0], policy: AccountPolicy) {
  return apiErrorResponse(
    context,
    403,
    "FORBIDDEN",
    "This account is currently restricted.",
    { restriction: policy.restriction, allowed: [...policy.allowed].sort() },
  );
}

/**
 * A policy lookup failure is unavailable, never an allow decision. Credential
 * failures continue to the feature's session middleware so existing 401 API
 * contracts remain unchanged.
 */
export function createAccountPolicyMiddleware(
  resolveSession: ResolveSession,
  policies: AccountPolicyResolver,
): MiddlewareHandler<AuthenticatedApiEnv> {
  return async (context, next) => {
    const capability = accountCapabilityForRequest(context.req.raw);
    if (!capability) return next();

    let actor: AuthenticatedActor | null | undefined;
    try {
      actor = await resolveSession(context.req.raw);
    } catch {
      return apiErrorResponse(context, 503, "SERVICE_UNAVAILABLE", "Account policy is temporarily unavailable.");
    }
    if (!actor?.userId) return next();

    let policy: AccountPolicy;
    try {
      policy = await policies.resolve(actor.userId);
    } catch {
      return apiErrorResponse(context, 503, "SERVICE_UNAVAILABLE", "Account policy is temporarily unavailable.");
    }
    context.set("actor", actor);
    if (!allowsAccountCapability(policy, capability)) return restrictedResponse(context, policy);
    return next();
  };
}
