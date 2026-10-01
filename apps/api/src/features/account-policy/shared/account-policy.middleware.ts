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
const publicApiRoutes = new Set([
  "GET /api/v1/health",
  "GET /api/v1/openapi.json",
  "GET /api/v1/test-contracts",
  "GET /api/v1/account/reauthenticate/google/callback",
  "GET /api/v1/legal/terms/current",
  "GET /api/v1/legal/terms/notice",
  "POST /api/v1/legal/registration-intents",
]);
const managementApiRoutes = new Map<string, AccountCapability>([
  ["GET /api/v1/account/status", "policy_read"],
  ["GET /api/v1/account/policy", "policy_read"],
  ["POST /api/v1/account/reauthenticate/password", "policy_read"],
  ["POST /api/v1/account/reauthenticate/google/begin", "policy_read"],
  ["POST /api/v1/account/reauthenticate/google/complete", "policy_read"],
  ["POST /api/v1/account/legal/acceptance", "policy_read"],
  ["GET /api/v1/account/export", "export"],
  ["POST /api/v1/account/export", "export"],
  ["DELETE /api/v1/account/export", "export"],
  ["GET /api/v1/account/export/download", "export"],
]);

/**
 * This is an exact method and normalized-path allowlist, not a prefix matcher.
 * A lookalike or an unregistered route therefore remains ordinary and is denied
 * for a restricted account before feature code runs.
 */
export function accountCapabilityForRequest(request: Request): AccountCapability | undefined {
  const url = new URL(request.url);
  const key = `${request.method.toUpperCase()} ${url.pathname}`;
  if (publicApiRoutes.has(key)) return undefined;
  return managementApiRoutes.get(key) ?? "ordinary";
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
    const capability = accountCapabilityForRequest(context.req.raw);
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
