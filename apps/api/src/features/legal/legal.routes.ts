import { createRoute, type OpenAPIHono, z } from "@hono/zod-openapi";
import type { DayliDatabase } from "@dayli/db";
import { ageDeclarationVersion } from "@dayli/contracts";
import { apiErrorResponse } from "../../http/api-error";
import type { AuthenticatedApiEnv } from "../../http/authenticated-actor";
import {
  consumeRegistrationIntent,
  issueRegistrationIntent,
  readCurrentTerms,
  readCurrentTermsContent,
  readCurrentTermsNotice,
  recordCurrentAcceptance,
  type RegistrationFlow,
} from "./shared/legal.repository";

export interface LegalRouteDependencies {
  withDatabase?<T>(run: (database: DayliDatabase) => Promise<T>): Promise<T>;
  trustedOrigins: readonly string[];
}

const digestPattern = /^[0-9a-f]{64}$/;
const security: Array<Record<string, string[]>> = [{ BearerAuth: [] }, { cookieAuth: [] }];
const termsSchema = z.object({
  id: z.string(), version: z.number().int().positive(), contentDigest: z.string().regex(digestPattern),
  status: z.literal("effective"), effectiveAt: z.string().datetime(), documentUrl: z.literal("/api/v1/legal/terms/current/content"),
});
const currentTermsContentRoute = createRoute({ method: "get", path: "/api/v1/legal/terms/current/content", tags: ["Legal"], operationId: "legal.getCurrentTermsContent", responses: { 200: { description: "Digest-verified canonical Terms source, or null before publication.", content: { "application/json": { schema: z.object({ terms: termsSchema.nullable(), canonicalContent: z.string().nullable() }) } } }, 503: { description: "Legal metadata unavailable." } } });
const currentTermsRoute = createRoute({ method: "get", path: "/api/v1/legal/terms/current", tags: ["Legal"], operationId: "legal.getCurrentTerms", responses: { 200: { description: "Current effective Terms, or null before publication.", content: { "application/json": { schema: z.object({ terms: termsSchema.nullable() }) } } }, 503: { description: "Legal metadata unavailable." } } });
const termsNoticeRoute = createRoute({ method: "get", path: "/api/v1/legal/terms/notice", tags: ["Legal"], operationId: "legal.getTermsNotice", responses: { 200: { description: "Current Terms notice, or null.", content: { "application/json": { schema: z.object({ notice: z.object({ id: z.string(), version: z.number().int().positive(), contentDigest: z.string().regex(digestPattern), materialChange: z.boolean(), noticeStartsAt: z.string().datetime(), effectiveAt: z.string().datetime(), urgentChangeReason: z.string().nullable(), documentUrl: z.literal("/api/v1/legal/terms/current/content") }).nullable() }) } } }, 503: { description: "Legal metadata unavailable." } } });
const registrationIntentRoute = createRoute({ method: "post", path: "/api/v1/legal/registration-intents", tags: ["Legal"], operationId: "legal.issueRegistrationIntent", request: { body: { content: { "application/json": { schema: z.object({ flow: z.enum(["email", "google_native", "google_browser"]), acceptTerms: z.literal(true), declareAge16OrOlder: z.literal(true) }) } } } }, responses: { 201: { description: "Short-lived opaque registration proof.", content: { "application/json": { schema: z.object({ intent: z.string().regex(/^[0-9a-f]{64}$/), flowBinding: z.string().regex(/^[0-9a-f]{64}$/), expiresAt: z.string().datetime(), terms: termsSchema, ageDeclarationVersion: z.literal("age-16-v1") }) } } }, 409: { description: "Terms are not published." }, 422: { description: "Unchecked Terms or age declaration." }, 503: { description: "Legal registration unavailable." } } });
const acceptanceRoute = createRoute({ method: "post", path: "/api/v1/account/legal/acceptance", tags: ["Legal"], operationId: "legal.acceptCurrentTerms", security, request: { body: { content: { "application/json": { schema: z.object({ acceptTerms: z.literal(true), declareAge16OrOlder: z.literal(true), termsVersionId: z.string(), contentDigest: z.string().regex(digestPattern) }) } } } }, responses: { 200: { description: "Current Terms acceptance recorded idempotently.", content: { "application/json": { schema: z.object({ terms: termsSchema, ageDeclarationVersion: z.literal("age-16-v1") }) } } }, 401: { description: "No current session." }, 409: { description: "Terms changed or not published." }, 422: { description: "Unchecked Terms or age declaration." }, 503: { description: "Legal acceptance unavailable." } } });

function permittedOrigin(request: Request, trustedOrigins: readonly string[]): boolean {
  const origin = request.headers.get("origin");
  return !origin || trustedOrigins.includes(origin);
}

function strictJson(request: Request): boolean {
  return request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase() === "application/json";
}

function isRegistrationFlow(value: unknown): value is RegistrationFlow {
  return value === "email" || value === "google_native" || value === "google_browser";
}

function publicTerms(document: NonNullable<Awaited<ReturnType<typeof readCurrentTerms>>>) {
  return {
    id: document.id,
    version: document.version,
    contentDigest: document.contentDigest,
    status: document.status,
    effectiveAt: document.effectiveAt.toISOString(),
    // This endpoint returns the server-verified canonical source for this version.
    documentUrl: "/api/v1/legal/terms/current/content",
  };
}

/**
 * Legal routes are exact middleware exemptions. They expose only the metadata
 * needed to render the canonical Terms document, never an acceptance record.
 */
export function registerLegalRoutes(app: OpenAPIHono<AuthenticatedApiEnv>, dependencies: LegalRouteDependencies) {
  app.openapi(currentTermsContentRoute, async (context) => {
    if (!dependencies.withDatabase) return apiErrorResponse(context, 503, "SERVICE_UNAVAILABLE", "Legal documents are temporarily unavailable.");
    try {
      const content = await dependencies.withDatabase(readCurrentTermsContent);
      context.header("Cache-Control", "no-store");
      return context.json(content ? { terms: publicTerms(content.terms), canonicalContent: content.canonicalContent } : { terms: null, canonicalContent: null }, 200);
    } catch {
      return apiErrorResponse(context, 503, "SERVICE_UNAVAILABLE", "Legal documents are temporarily unavailable.");
    }
  });

  app.openapi(currentTermsRoute, async (context) => {
    if (!dependencies.withDatabase) return apiErrorResponse(context, 503, "SERVICE_UNAVAILABLE", "Legal documents are temporarily unavailable.");
    try {
      const terms = await dependencies.withDatabase(readCurrentTerms);
      context.header("Cache-Control", "no-store");
      return context.json({ terms: terms ? publicTerms(terms) : null }, 200);
    } catch {
      return apiErrorResponse(context, 503, "SERVICE_UNAVAILABLE", "Legal documents are temporarily unavailable.");
    }
  });

  app.openapi(termsNoticeRoute, async (context) => {
    if (!dependencies.withDatabase) return apiErrorResponse(context, 503, "SERVICE_UNAVAILABLE", "Legal documents are temporarily unavailable.");
    try {
      const notice = await dependencies.withDatabase(readCurrentTermsNotice);
      context.header("Cache-Control", "no-store");
      return context.json({ notice: notice ? {
        ...notice,
        noticeStartsAt: notice.noticeStartsAt.toISOString(),
        effectiveAt: notice.effectiveAt.toISOString(),
        documentUrl: "/terms",
      } : null }, 200);
    } catch {
      return apiErrorResponse(context, 503, "SERVICE_UNAVAILABLE", "Legal documents are temporarily unavailable.");
    }
  });

  app.openapi(registrationIntentRoute, async (context) => {
    if (!dependencies.withDatabase) return apiErrorResponse(context, 503, "SERVICE_UNAVAILABLE", "Legal registration is temporarily unavailable.");
    if (!strictJson(context.req.raw) || !permittedOrigin(context.req.raw, dependencies.trustedOrigins)) {
      return apiErrorResponse(context, 403, "FORBIDDEN", "Legal registration is unavailable.");
    }
    const input = await context.req.json().catch(() => undefined) as { flow?: unknown; acceptTerms?: unknown; declareAge16OrOlder?: unknown } | undefined;
    if (!input || !isRegistrationFlow(input.flow) || input.acceptTerms !== true || input.declareAge16OrOlder !== true) {
      return apiErrorResponse(context, 422, "VALIDATION_FAILED", "Terms agreement and age declaration are required.");
    }
    const flow = input.flow;
    try {
      const intent = await dependencies.withDatabase((database) => issueRegistrationIntent(database, flow));
      if (!intent) return apiErrorResponse(context, 409, "CONFLICT", "Registration is not enabled until current Terms are available.");
      context.header("Cache-Control", "no-store");
      return context.json({
        intent: intent.token,
        flowBinding: intent.flowBinding,
        expiresAt: intent.expiresAt.toISOString(),
        terms: publicTerms(intent.terms),
        ageDeclarationVersion: intent.ageDeclarationVersion,
      }, 201);
    } catch {
      return apiErrorResponse(context, 503, "SERVICE_UNAVAILABLE", "Legal registration is temporarily unavailable.");
    }
  });

  app.openapi(acceptanceRoute, async (context) => {
    const actor = context.get("actor");
    if (!actor?.userId) return apiErrorResponse(context, 401, "UNAUTHENTICATED", "Authentication is required.");
    if (!dependencies.withDatabase) return apiErrorResponse(context, 503, "SERVICE_UNAVAILABLE", "Legal acceptance is temporarily unavailable.");
    if (!strictJson(context.req.raw) || !permittedOrigin(context.req.raw, dependencies.trustedOrigins)) {
      return apiErrorResponse(context, 403, "FORBIDDEN", "Legal acceptance is unavailable.");
    }
    const input = await context.req.json().catch(() => undefined) as {
      acceptTerms?: unknown;
      declareAge16OrOlder?: unknown;
      termsVersionId?: unknown;
      contentDigest?: unknown;
    } | undefined;
    if (!input || input.acceptTerms !== true || input.declareAge16OrOlder !== true || typeof input.termsVersionId !== "string" || typeof input.contentDigest !== "string" || !digestPattern.test(input.contentDigest)) {
      return apiErrorResponse(context, 422, "VALIDATION_FAILED", "Current Terms agreement and age declaration are required.");
    }
    try {
      const terms = await dependencies.withDatabase(async (database) => {
        const current = await readCurrentTerms(database);
        if (!current || current.id !== input.termsVersionId || current.contentDigest !== input.contentDigest) return null;
        await recordCurrentAcceptance(database, actor.userId, current);
        return current;
      });
      if (!terms) return apiErrorResponse(context, 409, "CONFLICT", "The displayed Terms are no longer current.");
      context.header("Cache-Control", "no-store");
      return context.json({ terms: publicTerms(terms), ageDeclarationVersion }, 200);
    } catch {
      return apiErrorResponse(context, 503, "SERVICE_UNAVAILABLE", "Legal acceptance is temporarily unavailable.");
    }
  });
}

export { consumeRegistrationIntent };
