import type { AccountManagementAction } from "../password/password.repository";
import { exchangeGoogleManagementCode } from "./google-proof-oauth";
import { verifyGoogleManagementIdToken } from "./google-oidc";
import type { GoogleProofConfiguration } from "./google-proof.repository";

const managementStatePattern = /^dayli-management-[0-9a-f]{64}$/;
const headers = {
  "Cache-Control": "no-store",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
};

export interface GoogleManagementCallbackDependencies {
  configuration: GoogleProofConfiguration;
  resolveSession: (request: Request) => Promise<{ userId: string; sessionId: string } | null>;
  claim: (input: { state: string; userId: string; sessionId: string }) => Promise<{
    stateDigest: string;
    action: AccountManagementAction;
    nonceDigest: string;
    createdAt: Date;
    linkedSubject: string;
  } | null>;
  complete: (input: { userId: string; sessionId: string; action: AccountManagementAction; stateDigest: string; verifiedSubject: string }) => Promise<{
    token: string;
    expiresAt: Date;
  } | null>;
  exchange?: typeof exchangeGoogleManagementCode;
  verify?: typeof verifyGoogleManagementIdToken;
}

function failure(status: number): Response {
  return Response.json({ error: { code: "GOOGLE_MANAGEMENT_PROOF_FAILED" } }, { status, headers });
}

/** The callback never calls Better Auth's login or linking handler. */
export async function handleGoogleManagementCallback(request: Request, deps: GoogleManagementCallbackDependencies): Promise<Response> {
  const query = new URL(request.url).searchParams;
  const state = query.get("state");
  const code = query.get("code");
  if (!state || !managementStatePattern.test(state) || !code || code.length > 2048 || /\s/.test(code)
    || query.getAll("state").length !== 1 || query.getAll("code").length !== 1 || query.has("error")) return failure(400);
  let actor: Awaited<ReturnType<typeof deps.resolveSession>>;
  try { actor = await deps.resolveSession(request); } catch { return failure(503); }
  if (!actor?.userId || !actor.sessionId) return failure(401);
  let intent: Awaited<ReturnType<typeof deps.claim>>;
  try { intent = await deps.claim({ state, ...actor }); } catch { return failure(503); }
  if (!intent) return failure(401);
  let result: Awaited<ReturnType<NonNullable<typeof deps.exchange>>>;
  try { result = await (deps.exchange ?? exchangeGoogleManagementCode)({ state, code, ...deps.configuration }); }
  catch { return failure(503); }
  let proof: Awaited<ReturnType<NonNullable<typeof deps.verify>>>;
  try {
    proof = await (deps.verify ?? verifyGoogleManagementIdToken)({
      idToken: result.idToken,
      grantedScope: result.grantedScope,
      clientId: deps.configuration.clientId,
      linkedSubject: intent.linkedSubject,
      nonceDigest: intent.nonceDigest,
      intentCreatedAt: intent.createdAt,
    });
  } catch { return failure(401); }
  try {
    const grant = await deps.complete({ ...actor, action: intent.action, stateDigest: intent.stateDigest, verifiedSubject: proof.subject });
    return grant
      ? Response.json({ action: intent.action, token: grant.token, expiresAt: grant.expiresAt.toISOString() }, { status: 200, headers })
      : failure(409);
  } catch { return failure(503); }
}

export function isGoogleManagementCallback(request: Request): boolean {
  return request.method === "GET"
    && new URL(request.url).pathname === "/api/auth/callback/google"
    && (new URL(request.url).searchParams.get("state")?.startsWith("dayli-management-") ?? false);
}
