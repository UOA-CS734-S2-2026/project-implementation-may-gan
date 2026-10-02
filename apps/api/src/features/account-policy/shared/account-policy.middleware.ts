import type { MiddlewareHandler } from "hono";
import { apiErrorResponse } from "../../../http/api-error";
import type { AuthenticatedActor, AuthenticatedApiEnv } from "../../../http/authenticated-actor";
import type { ResolveSession } from "../../../http/middleware/require-session";
import { actionableAccountCapabilities, allowsAccountCapability, type AccountCapability, type AccountPolicy } from "./account-policy";

export interface AccountPolicyResolver {
  resolve(userId: string): Promise<AccountPolicy>;
}

/** Every /api/v1 route is restrictive unless it is an exact reviewed exception. */
const publicApiRoutes = new Set([
  "GET /api/v1/health",
  "GET /api/v1/openapi.json",
  "GET /api/v1/legal/current",
  "POST /api/v1/legal/registration-intent",
  "GET /api/v1/test",
  // The opaque ticket is authenticated and policy-checked after consumption by
  // connectRealtime. The HTTP session middleware cannot see that credential.
  "GET /api/v1/realtime/connect",
]);
const managementApiRoutes = new Map<string, AccountCapability>([
  ["GET /api/v1/account/status", "policy_read"],
  ["GET /api/v1/account/policy", "policy_read"],
  ["POST /api/v1/legal/acceptance", "legal_acceptance"],
]);

function pathSegments(pathname: string): string[] {
  return pathname.split("/").filter(Boolean);
}

function matches(segments: readonly string[], expected: readonly string[]): boolean {
  return segments.length === expected.length && expected.every((segment, index) => segment === "*" || segments[index] === segment);
}

async function cleanupCapability(request: Request, pathname: string): Promise<AccountCapability | undefined> {
  const method = request.method.toUpperCase();
  const segments = pathSegments(pathname);
  if (method === "DELETE" && (
    matches(segments, ["api", "v1", "conversations", "*", "messages", "*"])
    || matches(segments, ["api", "v1", "conversations", "*", "messages", "*", "reaction"])
    || matches(segments, ["api", "v1", "push", "devices", "*"])
    || matches(segments, ["api", "v1", "profile", "avatar"])
    || matches(segments, ["api", "v1", "relationships", "*", "friendship"])
    || matches(segments, ["api", "v1", "relationships", "*", "block"])
  )) return "restricted_cleanup";
  if (method === "POST" && matches(segments, ["api", "v1", "relationships", "requests", "*", "decline"])) return "restricted_cleanup";
  if (method === "POST" && matches(segments, ["api", "v1", "relationships", "requests", "*", "cancel"])) return "restricted_cleanup";
  if (method !== "PUT" || !matches(segments, ["api", "v1", "conversations", "*", "request"])) return undefined;

  const body = await request.clone().json().catch(() => undefined);
  return body && typeof body === "object" && !Array.isArray(body) && (body as { decision?: unknown }).decision === "decline"
    ? "restricted_cleanup"
    : undefined;
}

/**
 * Exact method and path matching prevents an unreviewed route or lookalike
 * path from inheriting restricted-account access. The only body-sensitive
 * exception is the existing request-decline operation, not request acceptance.
 */
export async function accountCapabilityForRequest(request: Request): Promise<AccountCapability | undefined> {
  const url = new URL(request.url);
  const key = `${request.method.toUpperCase()} ${url.pathname}`;
  if (publicApiRoutes.has(key)) return undefined;
  if (key === "POST /api/v1/account/reauthenticate/password" || key === "POST /api/v1/account/reauthenticate/google") {
    const body: unknown = await request.clone().json().catch(() => undefined);
    return body && typeof body === "object" && !Array.isArray(body) && (body as { action?: unknown }).action === "cancel_deletion"
      ? "cancel_deletion_verification" : "request_deletion";
  }
  return managementApiRoutes.get(key) ?? await cleanupCapability(request, url.pathname) ?? "ordinary";
}

function restrictedResponse(context: Parameters<MiddlewareHandler<AuthenticatedApiEnv>>[0], policy: AccountPolicy) {
  return apiErrorResponse(
    context,
    403,
    "FORBIDDEN",
    "This account is currently restricted.",
    { restriction: policy.restriction, allowed: actionableAccountCapabilities(policy) },
  );
}

/**
 * Policy lookup failures are unavailable, never allow decisions. Every
 * non-public v1 route authenticates here, so future routes cannot become guest
 * accessible merely by omitting their own session middleware.
 */
export function createAccountPolicyMiddleware(
  resolveSession: ResolveSession,
  policies: AccountPolicyResolver,
): MiddlewareHandler<AuthenticatedApiEnv> {
  return async (context, next) => {
    const capability = await accountCapabilityForRequest(context.req.raw);
    if (!capability) return next();
    context.header("Cache-Control", "no-store");

    let actor: AuthenticatedActor | null | undefined;
    try {
      actor = await resolveSession(context.req.raw);
    } catch {
      return apiErrorResponse(context, 503, "SERVICE_UNAVAILABLE", "Account policy is temporarily unavailable.");
    }
    if (!actor?.userId) return apiErrorResponse(context, 401, "UNAUTHENTICATED", "Authentication is required.");

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
