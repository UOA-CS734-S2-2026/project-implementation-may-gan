import type { OpenAPIHono } from "@hono/zod-openapi";
import { apiErrorResponse } from "../../../http/api-error";
import type { AuthenticatedApiEnv } from "../../../http/authenticated-actor";
import type { AccountManagementGrantAction, VerifiedManagementSession } from "../shared/account-management-grants";

export interface AccountReauthenticationDependencies {
  trustedOrigins: readonly string[];
  verifyPassword(request: Request, password: string): Promise<VerifiedManagementSession | null>;
  issueGrant(session: VerifiedManagementSession, action: AccountManagementGrantAction): Promise<{ token: string; expiresAt: Date }>;
}

function isAction(value: unknown): value is AccountManagementGrantAction {
  return value === "request_deletion" || value === "cancel_deletion";
}

function permittedOrigin(request: Request, trustedOrigins: readonly string[]): boolean {
  const origin = request.headers.get("origin");
  return !origin || trustedOrigins.includes(origin);
}

/**
 * Password proof is delegated to Better Auth. This endpoint never compares a
 * password hash, accepts an asserted user ID, or returns a provider detail.
 */
export function registerAccountReauthenticationRoutes(
  app: OpenAPIHono<AuthenticatedApiEnv>,
  dependencies?: AccountReauthenticationDependencies,
) {
  app.post("/api/v1/account/reauthenticate/password", async (context) => {
    const actor = context.get("actor");
    if (!actor?.userId) return apiErrorResponse(context, 401, "UNAUTHENTICATED", "Authentication is required.");
    if (!dependencies) return apiErrorResponse(context, 503, "SERVICE_UNAVAILABLE", "Account reauthentication is temporarily unavailable.");
    if (!permittedOrigin(context.req.raw, dependencies.trustedOrigins)) return apiErrorResponse(context, 403, "FORBIDDEN", "Account reauthentication is unavailable.");

    const input = await context.req.json().catch(() => undefined) as { action?: unknown; password?: unknown } | undefined;
    if (!input || !isAction(input.action) || typeof input.password !== "string" || input.password.length === 0 || input.password.length > 1024) {
      return apiErrorResponse(context, 403, "FORBIDDEN", "Account reauthentication is unavailable.");
    }
    try {
      const session = await dependencies.verifyPassword(context.req.raw, input.password);
      if (!session || session.userId !== actor.userId) return apiErrorResponse(context, 403, "FORBIDDEN", "Account reauthentication is unavailable.");
      const grant = await dependencies.issueGrant(session, input.action);
      context.header("Cache-Control", "no-store");
      return context.json({ grant: grant.token, expiresAt: grant.expiresAt.toISOString() }, 200);
    } catch {
      return apiErrorResponse(context, 503, "SERVICE_UNAVAILABLE", "Account reauthentication is temporarily unavailable.");
    }
  });
}
