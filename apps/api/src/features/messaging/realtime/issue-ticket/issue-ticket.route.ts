import { createRoute, z, type OpenAPIHono } from "@hono/zod-openapi";
import { apiErrorResponse } from "../../../../http/api-error";
import type { AuthenticatedApiEnv } from "../../../../http/authenticated-actor";
import type { ResolveSession } from "../../../../http/middleware/require-session";
import type { VerifiedRealtimeSession } from "../shared/realtime-types";

export interface RealtimeTicketRouteDependencies {
  resolveSession: ResolveSession;
  resolveRealtimeSession(request: Request): Promise<VerifiedRealtimeSession | null>;
  tickets?: { issue(session: VerifiedRealtimeSession): Promise<{ ticket: string; expiresAt: Date }> };
  webSocketUrl: string;
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
    503: { description: "Realtime is unavailable." },
  },
});

export function registerIssueRealtimeTicketRoute(
  app: OpenAPIHono<AuthenticatedApiEnv>,
  dependencies: RealtimeTicketRouteDependencies,
) {
  app.openapi(route, async (context) => {
    context.header("Cache-Control", "no-store");
    if (!dependencies.tickets) return apiErrorResponse(context, 503, "SERVICE_UNAVAILABLE", "Realtime is temporarily unavailable.") as never;
    const session = await dependencies.resolveRealtimeSession(context.req.raw);
    if (!session || session.userId !== context.get("actor").userId) return apiErrorResponse(context, 401, "UNAUTHENTICATED", "Authentication is required.") as never;
    const ticket = await dependencies.tickets.issue(session);
    return context.json({ ticket: ticket.ticket, expiresAt: ticket.expiresAt.toISOString(), webSocketUrl: dependencies.webSocketUrl }, 201);
  });
}

export { registerIssueRealtimeTicketRoute as registerRealtimeTicketRoute };