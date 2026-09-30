import { createRoute, type OpenAPIHono, z } from "@hono/zod-openapi";
import { apiErrorResponse } from "../../../http/api-error";
import type { AuthenticatedApiEnv } from "../../../http/authenticated-actor";
import type { AccountManagementGrantAction, VerifiedManagementSession } from "../shared/account-management-grants";
import { decryptGoogleProofVerifier, digestGoogleProofSecret, encryptGoogleProofVerifier, type GoogleProofCryptoConfiguration } from "./google-proof-crypto";
import { createGoogleProofOAuthAdapter, generateGoogleProofSecret, type GoogleProofOAuthConfiguration } from "./google-proof-oauth";

export interface GoogleProofRouteDependencies {
  trustedOrigins: readonly string[];
  oauth: GoogleProofOAuthConfiguration;
  authorizeAction(userId: string, action: AccountManagementGrantAction): Promise<boolean>;
  resolveSession(request: Request): Promise<VerifiedManagementSession | null>;
  lifecycleGeneration(userId: string): Promise<number>;
  intents: {
    create(input: { stateDigest: string; nonceDigest: string; verifierCiphertext: string; verifierKeyVersion: string; session: VerifiedManagementSession; action: AccountManagementGrantAction; lifecycleGeneration: number }): Promise<boolean>;
    claim(stateDigest: string): Promise<{ claimToken: string; verifierCiphertext: string; verifierKeyVersion: string; userId: string; sessionId: string; action: AccountManagementGrantAction; lifecycleGeneration: number; nonceDigest: string } | null>;
    recordVerifiedProof(stateDigest: string, session: VerifiedManagementSession, claim: string, subject: string): Promise<boolean>;
    complete(stateDigest: string, session: VerifiedManagementSession, action: AccountManagementGrantAction): Promise<{ token: string; expiresAt: Date } | null>;
    fail(stateDigest: string, claim: string): Promise<boolean>;
  };
  verifyIdToken(idToken: string, nonceDigest: string): Promise<{ subject: string } | null>;
}

function isAction(value: unknown): value is AccountManagementGrantAction { return value === "request_deletion" || value === "cancel_deletion"; }
function isState(value: unknown): value is string { return typeof value === "string" && /^[A-Za-z0-9_-]{43,256}$/.test(value); }
function permittedOrigin(request: Request, trustedOrigins: readonly string[]): boolean {
  const origin = request.headers.get("origin");
  return !origin || trustedOrigins.includes(origin);
}
function callbackRedirect(completionUrl: string, state: string, outcome: "complete" | "failed"): Response {
  const url = new URL(completionUrl);
  url.searchParams.set("flow", state);
  url.searchParams.set("outcome", outcome);
  return new Response(null, { status: 303, headers: { Location: url.toString(), "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } });
}

const actionSchema = z.enum(["request_deletion", "cancel_deletion"]);
const beginRoute = createRoute({ method: "post", path: "/api/v1/account/reauthenticate/google/begin", tags: ["Account"], operationId: "account.googleProof.begin", request: { body: { content: { "application/json": { schema: z.object({ action: actionSchema }) } } } }, responses: { 200: { description: "A server-built Google authorization URL.", content: { "application/json": { schema: z.object({ authorizationUrl: z.string().url() }) } } }, 401: { description: "No valid session." }, 403: { description: "Proof unavailable." }, 503: { description: "Proof is not configured." } } });
const callbackRoute = createRoute({ method: "get", path: "/api/v1/account/reauthenticate/google/callback", tags: ["Account"], operationId: "account.googleProof.callback", request: { query: z.object({ state: z.string(), code: z.string().optional() }) }, responses: { 303: { description: "Fixed client completion redirect." }, 403: { description: "Invalid continuation." }, 503: { description: "Proof is not configured." } } });
const completeRoute = createRoute({ method: "post", path: "/api/v1/account/reauthenticate/google/complete", tags: ["Account"], operationId: "account.googleProof.complete", request: { body: { content: { "application/json": { schema: z.object({ action: actionSchema, state: z.string() }) } } } }, responses: { 200: { description: "Opaque short-lived management grant.", content: { "application/json": { schema: z.object({ grant: z.string(), expiresAt: z.string().datetime() }) } } }, 401: { description: "No valid session." }, 403: { description: "Proof unavailable." }, 503: { description: "Proof is not configured." } } });

/** Dedicated Google proof endpoints never invoke Better Auth social sign-in or account linking. */
export function registerGoogleProofRoutes(app: OpenAPIHono<AuthenticatedApiEnv>, dependencies?: GoogleProofRouteDependencies) {
  let adapter: ReturnType<typeof createGoogleProofOAuthAdapter> | undefined;
  try { adapter = dependencies ? createGoogleProofOAuthAdapter(dependencies.oauth) : undefined; } catch { adapter = undefined; }
  app.openapi(beginRoute, async (context) => {
    const actor = context.get("actor");
    if (!actor?.userId) return apiErrorResponse(context, 401, "UNAUTHENTICATED", "Authentication is required.");
    if (!dependencies || !adapter) return apiErrorResponse(context, 503, "SERVICE_UNAVAILABLE", "Google reauthentication is temporarily unavailable.");
    if (!permittedOrigin(context.req.raw, dependencies.trustedOrigins)) return apiErrorResponse(context, 403, "FORBIDDEN", "Google reauthentication is unavailable.");
    const input = await context.req.json().catch(() => undefined) as { action?: unknown } | undefined;
    if (!input || !isAction(input.action)) return apiErrorResponse(context, 403, "FORBIDDEN", "Google reauthentication is unavailable.");
    try {
      if (!await dependencies.authorizeAction(actor.userId, input.action)) return apiErrorResponse(context, 403, "FORBIDDEN", "Google reauthentication is unavailable.");
      const session = await dependencies.resolveSession(context.req.raw);
      if (!session || session.userId !== actor.userId) return apiErrorResponse(context, 403, "FORBIDDEN", "Google reauthentication is unavailable.");
      const lifecycleGeneration = await dependencies.lifecycleGeneration(actor.userId);
      if (!Number.isSafeInteger(lifecycleGeneration) || lifecycleGeneration < 0) throw new TypeError("Invalid lifecycle generation.");
      const state = generateGoogleProofSecret();
      const nonce = generateGoogleProofSecret();
      const verifier = generateGoogleProofSecret();
      const stateDigest = await digestGoogleProofSecret(state);
      const nonceDigest = await digestGoogleProofSecret(nonce);
      const keys: GoogleProofCryptoConfiguration = { encryption: dependencies.oauth.encryption, subjectHmac: dependencies.oauth.subjectHmac };
      const verifierCiphertext = await encryptGoogleProofVerifier(verifier, { stateDigest, userId: session.userId, sessionId: session.sessionId, action: input.action, lifecycleGeneration }, keys.encryption);
      if (!await dependencies.intents.create({ stateDigest, nonceDigest, verifierCiphertext, verifierKeyVersion: keys.encryption.version, session, action: input.action, lifecycleGeneration })) return apiErrorResponse(context, 403, "FORBIDDEN", "Google reauthentication is unavailable.");
      const authorizationUrl = await adapter!.authorizationUrl(state, nonce, verifier);
      context.header("Cache-Control", "no-store");
      context.header("Referrer-Policy", "no-referrer");
      return context.json({ authorizationUrl }, 200);
    } catch { return apiErrorResponse(context, 503, "SERVICE_UNAVAILABLE", "Google reauthentication is temporarily unavailable."); }
  });

  app.openapi(callbackRoute, async (context) => {
    if (!dependencies || !adapter) return apiErrorResponse(context, 503, "SERVICE_UNAVAILABLE", "Google reauthentication is temporarily unavailable.");
    const state = context.req.query("state");
    if (!isState(state)) return apiErrorResponse(context, 403, "FORBIDDEN", "Google reauthentication is unavailable.");
    const stateDigest = await digestGoogleProofSecret(state);
    const claim = await dependencies.intents.claim(stateDigest).catch(() => null);
    if (!claim) return callbackRedirect(adapter.completionUrl, state, "failed");
    const fail = async () => { await dependencies.intents.fail(stateDigest, claim.claimToken).catch(() => false); return callbackRedirect(adapter.completionUrl, state, "failed"); };
    const code = context.req.query("code");
    if (typeof code !== "string") return fail();
    try {
      const verifier = await decryptGoogleProofVerifier(claim.verifierCiphertext, { stateDigest, userId: claim.userId, sessionId: claim.sessionId, action: claim.action, lifecycleGeneration: claim.lifecycleGeneration }, dependencies.oauth.encryption);
      if (!verifier || claim.verifierKeyVersion !== dependencies.oauth.encryption.version) return fail();
      const idToken = await adapter!.exchangeCode(code, verifier);
      if (!idToken) return fail();
      const verified = await dependencies.verifyIdToken(idToken, claim.nonceDigest);
      if (!verified || !await dependencies.intents.recordVerifiedProof(stateDigest, { userId: claim.userId, sessionId: claim.sessionId }, claim.claimToken, verified.subject)) return fail();
      return callbackRedirect(adapter.completionUrl, state, "complete");
    } catch { return fail(); }
  });

  app.openapi(completeRoute, async (context) => {
    const actor = context.get("actor");
    if (!actor?.userId) return apiErrorResponse(context, 401, "UNAUTHENTICATED", "Authentication is required.");
    if (!dependencies || !adapter) return apiErrorResponse(context, 503, "SERVICE_UNAVAILABLE", "Google reauthentication is temporarily unavailable.");
    if (!permittedOrigin(context.req.raw, dependencies.trustedOrigins)) return apiErrorResponse(context, 403, "FORBIDDEN", "Google reauthentication is unavailable.");
    const input = await context.req.json().catch(() => undefined) as { action?: unknown; state?: unknown } | undefined;
    if (!input || !isAction(input.action) || !isState(input.state)) return apiErrorResponse(context, 403, "FORBIDDEN", "Google reauthentication is unavailable.");
    try {
      if (!await dependencies.authorizeAction(actor.userId, input.action)) return apiErrorResponse(context, 403, "FORBIDDEN", "Google reauthentication is unavailable.");
      const session = await dependencies.resolveSession(context.req.raw);
      if (!session || session.userId !== actor.userId) return apiErrorResponse(context, 403, "FORBIDDEN", "Google reauthentication is unavailable.");
      const grant = await dependencies.intents.complete(await digestGoogleProofSecret(input.state), session, input.action);
      if (!grant) return apiErrorResponse(context, 403, "FORBIDDEN", "Google reauthentication is unavailable.");
      context.header("Cache-Control", "no-store");
      return context.json({ grant: grant.token, expiresAt: grant.expiresAt.toISOString() }, 200);
    } catch { return apiErrorResponse(context, 503, "SERVICE_UNAVAILABLE", "Google reauthentication is temporarily unavailable."); }
  });
}
