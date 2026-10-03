import { createRoute, z, type OpenAPIHono } from "@hono/zod-openapi";
import { rateLimitErrorResponse } from "../../../../http/rate-limit-contract";
import { apiErrorResponse } from "../../../../http/api-error";
import type { AuthenticatedApiEnv } from "../../../../http/authenticated-actor";
import type { ResolveSession } from "../../../../http/middleware/require-session";
import { usernameSetupStatus, type HasUsername } from "../../../../http/middleware/require-username";
import type { VerifiedRealtimeSession } from "../shared/realtime-types";

export interface RealtimeTicketRouteDependencies {
  resolveSession: ResolveSession;
  resolveRealtimeSession(request: Request): Promise<VerifiedRealtimeSession | null>;
  tickets?: { issue(session: VerifiedRealtimeSession): Promise<{ ticket: string; expiresAt: Date }> };
  webSocketUrl: string;
  hasUsername?: HasUsername;
  /** Fresh account-policy check before a ticket can become a WebSocket upgrade. */
  policyAllowsOrdinary(userId: string): Promise<boolean>;
}

const route = createRoute({
  method: "post",
  path: "/api/v1/realtime/tickets",
  tags: ["Messaging"],
  operationId: "createRealtimeTicket",
  security: [{ BearerAuth: [] }, { cookieAuth: [] }],
  request: { body: { required: true, content: { "application/json": { schema: z.object({}).strict() } } } },
  responses: {
    201: {
      description: "A short-lived single-use ticket.",
      content: { "application/json": { schema: z.object({ ticket: z.string(), expiresAt: z.string().datetime(), webSocketUrl: z.string().url() }) } },
    },
    401: { description: "Unauthenticated." },
    403: { description: "Username setup is required." },
    429: rateLimitErrorResponse,
    503: { description: "Realtime is unavailable." },
  },
});

export function registerIssueRealtimeTicketRoute(
  app: OpenAPIHono<AuthenticatedApiEnv>,
  dependencies: RealtimeTicketRouteDependencies,
) {
  app.openapi(route, async (context) => {
    context.header("Cache-Control", "no-store");
    const usernameStatus = await usernameSetupStatus(dependencies.hasUsername, context.get("actor").userId);
    if (usernameStatus === "unavailable") return apiErrorResponse(context, 503, "SERVICE_UNAVAILABLE", "Username setup is temporarily unavailable.") as never;
    if (usernameStatus === "missing") return apiErrorResponse(context, 403, "FORBIDDEN", "Choose a username before using messaging.") as never;
    if (!dependencies.tickets) return apiErrorResponse(context, 503, "SERVICE_UNAVAILABLE", "Realtime is temporarily unavailable.") as never;
    const session = await dependencies.resolveRealtimeSession(context.req.raw);
    if (!session || session.userId !== context.get("actor").userId) return apiErrorResponse(context, 401, "UNAUTHENTICATED", "Authentication is required.") as never;
    try {
      if (!await dependencies.policyAllowsOrdinary(session.userId)) {
        return apiErrorResponse(context, 403, "FORBIDDEN", "This account is currently restricted.") as never;
      }
    } catch {
      return apiErrorResponse(context, 503, "SERVICE_UNAVAILABLE", "Account policy is temporarily unavailable.") as never;
    }
    const ticket = await dependencies.tickets.issue(session);
    return context.json({ ticket: ticket.ticket, expiresAt: ticket.expiresAt.toISOString(), webSocketUrl: dependencies.webSocketUrl }, 201);
  });
}

export { registerIssueRealtimeTicketRoute as registerRealtimeTicketRoute };