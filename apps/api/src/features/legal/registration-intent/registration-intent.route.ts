import { age16DeclarationVersion, apiErrorSchema, utcTimestampSchema } from "@dayli/contracts";
import { createRoute, type OpenAPIHono, z } from "@hono/zod-openapi";
import type { AuthenticatedApiEnv } from "../../../http/authenticated-actor";
import { apiErrorResponse } from "../../../http/api-error";
import type { RegistrationIntentRequest, IssuedRegistrationIntent } from "../shared/registration-intent.repository";

export interface RegistrationIntentRouteDependencies {
  current?: () => Promise<{ termsVersionId: string; termsContentDigest: string } | null>;
  issue?: (input: RegistrationIntentRequest) => Promise<IssuedRegistrationIntent>;
}

const requestSchema = z.object({
  flow: z.enum(["email", "google_native", "google_browser"]),
  termsVersionId: z.string().min(1).max(200),
  termsContentDigest: z.string().regex(/^[0-9a-f]{64}$/),
  acceptedTermsAndDeclaredAge16: z.boolean(),
}).strict().openapi("RegistrationIntentRequest");
const currentResponse = z.object({
  status: z.enum(["unavailable", "effective"]),
  termsVersionId: z.string().nullable(),
  termsContentDigest: z.string().nullable(),
  ageDeclarationVersion: z.string().nullable(),
}).openapi("CurrentLegalRegistrationTerms");
const issueResponse = z.object({
  token: z.string(),
  binding: z.string(),
  termsVersionId: z.string(),
  expiresAt: utcTimestampSchema,
}).openapi("RegistrationIntentResponse");
const error = (description: string) => ({ description, content: { "application/json": { schema: apiErrorSchema } } });
const currentPath = "/api/v1/legal/current";
const intentPath = "/api/v1/legal/registration-intent";
const currentRoute = createRoute({
  method: "get", path: currentPath, tags: ["Legal"], operationId: "legal.currentRegistrationTerms",
  summary: "Read current published signup Terms metadata",
  responses: {
    200: { description: "Draft documents are not available for acceptance. The response has no private data.", content: { "application/json": { schema: currentResponse } } },
    503: error("The legal version cannot be verified."),
  },
});
const intentRoute = createRoute({
  method: "post", path: intentPath, tags: ["Legal"], operationId: "legal.issueRegistrationIntent",
  summary: "Start one explicit email or Google registration action",
  description: "Requires current approved documents and one affirmative Terms, Privacy notice, and 16+ action before account creation.",
  request: { body: { required: true, content: { "application/json": { schema: requestSchema } } } },
  responses: {
    200: { description: "Opaque, short-lived, one-use registration proof.", content: { "application/json": { schema: issueResponse } } },
    409: error("No current approved Terms or the selected version changed."),
    422: error("Explicit acceptance and a valid flow are required."),
    429: error("Too many registration attempts."),
    503: error("The legal version cannot be verified."),
  },
});

export function registerRegistrationIntentRoutes(app: OpenAPIHono<AuthenticatedApiEnv>, dependencies: RegistrationIntentRouteDependencies) {
  app.openapi(currentRoute, async (context) => {
    context.header("Cache-Control", "no-store");
    if (!dependencies.current) return apiErrorResponse(context, 503, "SERVICE_UNAVAILABLE", "Legal versions are unavailable.");
    try {
      const current = await dependencies.current();
      return context.json({
        status: current ? "effective" as const : "unavailable" as const,
        termsVersionId: current?.termsVersionId ?? null,
        termsContentDigest: current?.termsContentDigest ?? null,
        ageDeclarationVersion: current ? age16DeclarationVersion : null,
      }, 200);
    } catch {
      return apiErrorResponse(context, 503, "SERVICE_UNAVAILABLE", "Legal versions are unavailable.");
    }
  });
  app.openapi(intentRoute, async (context) => {
    context.header("Cache-Control", "no-store");
    if (!dependencies.issue) return apiErrorResponse(context, 503, "SERVICE_UNAVAILABLE", "Registration is unavailable.");
    const parsed = requestSchema.safeParse((context.req as unknown as { valid(key: "json"): unknown }).valid("json"));
    if (!parsed.success || parsed.data.acceptedTermsAndDeclaredAge16 !== true) {
      return apiErrorResponse(context, 422, "VALIDATION_FAILED", "Explicit Terms and 16+ confirmation is required.");
    }
    try {
      const result = await dependencies.issue({ ...parsed.data, acceptedTermsAndDeclaredAge16: true });
      if (result.status !== "issued") return apiErrorResponse(context, 409, "CONFLICT", "Current Terms are unavailable or have changed.");
      return context.json({ token: result.token, binding: result.binding, termsVersionId: result.termsVersionId, expiresAt: result.expiresAt.toISOString() }, 200);
    } catch {
      return apiErrorResponse(context, 503, "SERVICE_UNAVAILABLE", "Registration is unavailable.");
    }
  });
}
