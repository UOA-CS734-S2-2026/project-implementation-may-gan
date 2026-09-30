import type { MiddlewareHandler } from "hono";
import { apiErrorResponse } from "../../../http/api-error";
import type { AuthenticatedActor, AuthenticatedApiEnv } from "../../../http/authenticated-actor";
import type { ResolveSession } from "../../../http/middleware/require-session";
import { allowsAccountCapability, type AccountCapability, type AccountPolicy } from "./account-policy";

export interface AccountPolicyResolver {
  resolve(userId: string): Promise<AccountPolicy>;
}

/**
 * Every /api/v1 route is policy protected by default. Public routes must be
 * listed here, which makes a newly registered API route restrictive until its
 * capability has been reviewed.
 */
export const publicApiPaths = new Set(["/api/v1/health", "/api/v1/openapi.json", "/api/v1/test-contracts"]);

export function accountCapabilityForPath(pathname: string): AccountCapability | undefined {
  if (publicApiPaths.has(pathname)) return undefined;
  if (pathname === "/api/v1/account/status" || pathname === "/api/v1/account/policy") return "policy_read";
  if (pathname.startsWith("/api/v1/account/cancel-deletion")) return "cancel_deletion_verification";
  if (pathname.startsWith("/api/v1/account/exports")) return "export";
  if (pathname.startsWith("/api/v1/account/appeal")) return "appeal";
  if (pathname.startsWith("/api/v1/account/request-deletion")) return "request_deletion";
  return "ordinary";
}

function privateRestriction(context: Parameters<MiddlewareHandler<AuthenticatedApiEnv>>[0], policy: AccountPolicy) {
  return apiErrorResponse(
    context,
    403,
    "FORBIDDEN",
    "This account is currently restricted.",
    { restriction: policy.restriction, allowed: [...policy.allowed].sort() },
  );
}

/**
 * Resolves credentials exactly as feature middleware does. A credential failure
 * remains 401 at the feature boundary, but a policy reader failure is 503 so a
 * temporary database problem never becomes an access bypass.
 */
export function createAccountPolicyMiddleware(
  resolveSession: ResolveSession,
  policies: AccountPolicyResolver,
): MiddlewareHandler<AuthenticatedApiEnv> {
  return async (context, next) => {
    const capability = accountCapabilityForPath(new URL(context.req.raw.url).pathname);
    if (!capability) return next();
    context.header("Cache-Control", "no-store");

    let actor: AuthenticatedActor | null | undefined;
    try {
      actor = await resolveSession(context.req.raw);
    } catch {
      return apiErrorResponse(context, 503, "SERVICE_UNAVAILABLE", "Account policy is temporarily unavailable.");
    }
    // Individual feature middleware owns the stable unauthenticated response.
    if (!actor?.userId) return next();

    let policy: AccountPolicy;
    try {
      policy = await policies.resolve(actor.userId);
    } catch {
      return apiErrorResponse(context, 503, "SERVICE_UNAVAILABLE", "Account policy is temporarily unavailable.");
    }
    context.set("actor", actor);
    return allowsAccountCapability(policy, capability) ? next() : privateRestriction(context, policy);
  };
}
