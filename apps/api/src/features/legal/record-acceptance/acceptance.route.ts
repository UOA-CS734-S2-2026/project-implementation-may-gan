import { apiErrorSchema, utcTimestampSchema } from "@dayli/contracts";
import { createRoute, type OpenAPIHono, z } from "@hono/zod-openapi";
import type { AuthenticatedApiEnv } from "../../../http/authenticated-actor";
import { apiErrorResponse } from "../../../http/api-error";
import { createRequireSession, type ResolveSession } from "../../../http/middleware/require-session";
import type { ExplicitLegalAcceptance, LegalAcceptanceResult } from "./acceptance.repository";

export interface LegalAcceptanceRouteDependencies {
  resolveSession: ResolveSession;
  record?: (userId: string, input: ExplicitLegalAcceptance) => Promise<LegalAcceptanceResult>;
}

const requestSchema = z.object({
  termsVersionId: z.string().min(1).max(200),
  termsContentDigest: z.string().regex(/^[0-9a-f]{64}$/),
  acceptedTermsAndDeclaredAge16: z.boolean(),
}).strict().openapi("LegalAcceptanceRequest");

const responseSchema = z.object({
  termsVersionId: z.string(),
  acceptedAt: utcTimestampSchema,
  declaredAt: utcTimestampSchema,
}).openapi("LegalAcceptanceResponse");
const error = (description: string) => ({ description, content: { "application/json": { schema: apiErrorSchema } } });
const path = "/api/v1/legal/acceptance";
const route = createRoute({
  method: "post",
  path,
  tags: ["Legal"],
  operationId: "legal.recordAcceptance",
  summary: "Record an explicit current Terms and 16+ action",
  description: "Available only for an effective Terms version. The Privacy Policy is a notice, not consent. No draft document can be accepted.",
  security: [{ BearerAuth: [] }, { cookieAuth: [] }],
  request: { body: { required: true, content: { "application/json": { schema: requestSchema } } } },
  responses: {
    200: { description: "The server-recorded Terms and age declaration timestamps.", content: { "application/json": { schema: responseSchema } } },
    401: error("Authentication is required."),
    403: error("The account cannot accept Terms in its current state."),
    409: error("The requested Terms are stale or no Terms are effective."),
    422: error("Explicit confirmation and an exact current Terms digest are required."),
    503: error("Legal acceptance is temporarily unavailable."),
  },
});

export function registerLegalAcceptanceRoute(app: OpenAPIHono<AuthenticatedApiEnv>, dependencies: LegalAcceptanceRouteDependencies) {
  app.on("POST", path, createRequireSession(dependencies.resolveSession));
  app.openapi(route, async (context) => {
    context.header("Cache-Control", "no-store");
    if (!dependencies.record) return apiErrorResponse(context, 503, "SERVICE_UNAVAILABLE", "Legal acceptance is temporarily unavailable.");
    // OpenAPIHono validates the body before this handler. Re-parse its cached
    // value because the route's inferred JSON input is `never` in this schema.
    const parsed = requestSchema.safeParse((context.req as unknown as { valid(key: "json"): unknown }).valid("json"));
    if (!parsed.success || !parsed.data.acceptedTermsAndDeclaredAge16) {
      return apiErrorResponse(context, 422, "VALIDATION_FAILED", "Explicit confirmation and a current Terms digest are required.");
    }
    try {
      const result = await dependencies.record(context.get("actor").userId, { ...parsed.data, acceptedTermsAndDeclaredAge16: true });
      switch (result.status) {
        case "recorded":
          return context.json({ termsVersionId: result.termsVersionId, acceptedAt: result.acceptedAt.toISOString(), declaredAt: result.declaredAt.toISOString() }, 200);
        case "restricted":
          return apiErrorResponse(context, 403, "FORBIDDEN", "This account cannot accept Terms right now.");
        case "stale":
        case "unavailable":
          return apiErrorResponse(context, 409, "CONFLICT", "Current Terms are unavailable or have changed.");
      }
    } catch {
      return apiErrorResponse(context, 503, "SERVICE_UNAVAILABLE", "Legal acceptance is temporarily unavailable.");
    }
  });
}
