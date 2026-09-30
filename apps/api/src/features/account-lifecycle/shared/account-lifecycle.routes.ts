import { createRoute, type OpenAPIHono, z } from "@hono/zod-openapi";
import type { AuthenticatedApiEnv } from "../../../http/authenticated-actor";
import { apiErrorResponse } from "../../../http/api-error";
import type { AccountLifecycleView, LifecycleTransition, VerifiedManagementSession } from "./account-lifecycle.repository";

export interface AccountLifecycleRouteDependencies {
  requestsEnabled: boolean;
  resolveSession(request: Request): Promise<VerifiedManagementSession | null>;
  repository: {
    status(userId: string): Promise<AccountLifecycleView>;
    request(session: VerifiedManagementSession, grant: string, idempotencyKey?: string): Promise<LifecycleTransition | null>;
    cancel(session: VerifiedManagementSession, grant: string): Promise<LifecycleTransition | null>;
  };
  /** Best-effort post-commit socket invalidation. PostgreSQL policy remains fail closed. */
  revokeRealtimeSessions?(userId: string, sessionIds: readonly string[]): Promise<void>;
}

const statusSchema = z.object({
  state: z.enum(["active", "pending_deletion", "purging", "purge_failed"]),
  generation: z.number().int().nonnegative(),
  requestId: z.string().uuid().optional(),
  requestedAt: z.string().datetime().optional(),
  cancelUntil: z.string().datetime().optional(),
  purgeDueAt: z.string().datetime().optional(),
});
const grantSchema = z.object({ grant: z.string().min(32).max(256) });
const statusRoute = createRoute({ method: "get", path: "/api/v1/account/deletion", tags: ["Account"], operationId: "account.deletionStatus", responses: { 200: { description: "Current account-deletion state.", content: { "application/json": { schema: statusSchema } } }, 401: { description: "No valid session." }, 503: { description: "Lifecycle service unavailable." } } });
const requestRoute = createRoute({ method: "post", path: "/api/v1/account/deletion/request", tags: ["Account"], operationId: "account.requestDeletion", request: { body: { content: { "application/json": { schema: grantSchema } } } }, responses: { 200: { description: "Pending deletion request.", content: { "application/json": { schema: statusSchema.extend({ restrictedSession: z.literal(true) }) } } }, 403: { description: "Proof unavailable or requests disabled." }, 401: { description: "No valid session." }, 503: { description: "Lifecycle service unavailable." } } });
const cancelRoute = createRoute({ method: "post", path: "/api/v1/account/deletion/cancel", tags: ["Account"], operationId: "account.cancelDeletion", request: { body: { content: { "application/json": { schema: grantSchema } } } }, responses: { 200: { description: "Deletion cancellation accepted. A new ordinary sign-in is required.", content: { "application/json": { schema: statusSchema.extend({ reauthenticationRequired: z.literal(true) }) } } }, 403: { description: "Proof unavailable or cancellation window closed." }, 401: { description: "No valid session." }, 503: { description: "Lifecycle service unavailable." } } });

function response(view: AccountLifecycleView) {
  return view.state === "active"
    ? { state: view.state, generation: view.generation }
    : { state: view.state, generation: view.generation, requestId: view.requestId, requestedAt: view.requestedAt.toISOString(), cancelUntil: view.cancelUntil.toISOString(), purgeDueAt: view.purgeDueAt.toISOString() };
}

async function actorSession(context: { get(key: "actor"): { userId?: string } | undefined; req: { raw: Request } }, dependencies: AccountLifecycleRouteDependencies) {
  const actor = context.get("actor");
  if (!actor?.userId) return null;
  const session = await dependencies.resolveSession(context.req.raw);
  return session?.userId === actor.userId ? session : null;
}

async function revokeAfterCommit(dependencies: AccountLifecycleRouteDependencies, userId: string, sessions: readonly string[]) {
  if (sessions.length > 0) await dependencies.revokeRealtimeSessions?.(userId, sessions).catch(() => undefined);
}

/** These transitions do not start physical purge work. New requests are disabled unless explicitly configured. */
export function registerAccountLifecycleRoutes(app: OpenAPIHono<AuthenticatedApiEnv>, dependencies?: AccountLifecycleRouteDependencies) {
  app.openapi(statusRoute, async (context) => {
    const actor = context.get("actor");
    if (!actor?.userId) return apiErrorResponse(context, 401, "UNAUTHENTICATED", "Authentication is required.");
    if (!dependencies) return apiErrorResponse(context, 503, "SERVICE_UNAVAILABLE", "Account lifecycle is temporarily unavailable.");
    try { context.header("Cache-Control", "no-store"); return context.json(response(await dependencies.repository.status(actor.userId)), 200); }
    catch { return apiErrorResponse(context, 503, "SERVICE_UNAVAILABLE", "Account lifecycle is temporarily unavailable."); }
  });
  app.openapi(requestRoute, async (context) => {
    if (!dependencies?.requestsEnabled) return apiErrorResponse(context, 403, "FORBIDDEN", "Account deletion requests are currently unavailable.");
    const input = await context.req.json().catch(() => undefined);
    const parsed = grantSchema.safeParse(input);
    const grant = parsed.success ? parsed.data.grant : undefined;
    const idempotencyKey = context.req.header("idempotency-key") ?? undefined;
    const session = grant && (!idempotencyKey || (idempotencyKey.length >= 1 && idempotencyKey.length <= 255)) ? await actorSession(context, dependencies) : null;
    if (!session || !grant) return apiErrorResponse(context, context.get("actor")?.userId ? 403 : 401, context.get("actor")?.userId ? "FORBIDDEN" : "UNAUTHENTICATED", "Account deletion request is unavailable.");
    try {
      const transition = await dependencies.repository.request(session, grant, idempotencyKey);
      if (!transition) return apiErrorResponse(context, 403, "FORBIDDEN", "Account deletion request is unavailable.");
      await revokeAfterCommit(dependencies, session.userId, transition.revokedSessionIds);
      context.header("Cache-Control", "no-store");
      return context.json({ ...response(transition.view), restrictedSession: true }, 200);
    } catch { return apiErrorResponse(context, 503, "SERVICE_UNAVAILABLE", "Account lifecycle is temporarily unavailable."); }
  });
  app.openapi(cancelRoute, async (context) => {
    const input = await context.req.json().catch(() => undefined);
    const parsed = grantSchema.safeParse(input);
    const grant = parsed.success ? parsed.data.grant : undefined;
    const session = grant && dependencies ? await actorSession(context, dependencies) : null;
    if (!dependencies) return apiErrorResponse(context, 503, "SERVICE_UNAVAILABLE", "Account lifecycle is temporarily unavailable.");
    if (!session || !grant) return apiErrorResponse(context, context.get("actor")?.userId ? 403 : 401, context.get("actor")?.userId ? "FORBIDDEN" : "UNAUTHENTICATED", "Account deletion cancellation is unavailable.");
    try {
      const transition = await dependencies.repository.cancel(session, grant);
      if (!transition) return apiErrorResponse(context, 403, "FORBIDDEN", "Account deletion cancellation is unavailable.");
      await revokeAfterCommit(dependencies, session.userId, transition.revokedSessionIds);
      context.header("Cache-Control", "no-store");
      return context.json({ ...response(transition.view), reauthenticationRequired: true }, 200);
    } catch { return apiErrorResponse(context, 503, "SERVICE_UNAVAILABLE", "Account lifecycle is temporarily unavailable."); }
  });
}
