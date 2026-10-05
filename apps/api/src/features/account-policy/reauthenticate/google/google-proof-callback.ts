import type { AccountManagementAction } from "../password/password.repository";
import { exchangeGoogleManagementCode } from "./google-proof-oauth";
import { verifyGoogleManagementIdToken } from "./google-oidc";
import { googleManagementCompletionOrigin, type GoogleProofConfiguration } from "./google-proof.repository";
const headers = {
  "Cache-Control": "no-store",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  "Content-Security-Policy": "default-src 'none'; script-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'",
};

export interface GoogleManagementCallbackDependencies {
  configuration: GoogleProofConfiguration;
  trustedOrigins: readonly string[];
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

function handoffFailure(action: AccountManagementAction, completionOrigin: string): Response {
  const payload = JSON.stringify({ type: "dayli.account-management-proof-failure", action });
  const body = `<!doctype html><meta charset="utf-8"><title>Google verification did not complete</title><script>const failure=${payload};if(window.opener){window.opener.postMessage(failure,${JSON.stringify(completionOrigin)});window.close()}else{document.body.textContent="Google verification did not complete. Return to Dayli to try again."}</script>`;
  return new Response(body, { status: 200, headers: { ...headers, "Content-Type": "text/html; charset=utf-8" } });
}

/**
 * The single-use grant never enters a URL. A popup can deliver it only to its
 * opener at the signed, intent-bound trusted origin. The opener verifies the
 * callback origin before using the action-bound grant. A same-tab fallback
 * deliberately exposes no token to the document.
 */
function success(action: AccountManagementAction, token: string, completionOrigin: string): Response {
  const payload = JSON.stringify({ type: "dayli.account-management-grant", action, token });
  const body = `<!doctype html><meta charset="utf-8"><title>Google verification complete</title><script>const grant=${payload};if(window.opener){window.opener.postMessage(grant,${JSON.stringify(completionOrigin)});window.close()}else{document.body.textContent="Google verification complete. Return to Dayli to continue."}</script>`;
  return new Response(body, { status: 200, headers: { ...headers, "Content-Type": "text/html; charset=utf-8" } });
}

/** The callback never calls Better Auth's login or linking handler. */
export async function handleGoogleManagementCallback(request: Request, deps: GoogleManagementCallbackDependencies): Promise<Response> {
  const query = new URL(request.url).searchParams;
  const state = query.get("state");
  const code = query.get("code");
  if (!state || query.getAll("state").length !== 1) return failure(400);
  const completionOrigin = await googleManagementCompletionOrigin(state, deps.configuration.stateSecret);
  if (!completionOrigin || !deps.trustedOrigins.includes(completionOrigin)) return failure(400);
  let actor: Awaited<ReturnType<typeof deps.resolveSession>>;
  try { actor = await deps.resolveSession(request); } catch { return failure(503); }
  if (!actor?.userId || !actor.sessionId) return failure(401);
  let intent: Awaited<ReturnType<typeof deps.claim>>;
  try { intent = await deps.claim({ state, ...actor }); } catch { return failure(503); }
  if (!intent) return failure(401);
  if (!code || code.length > 2048 || /\s/.test(code) || query.getAll("code").length !== 1 || query.has("error")) {
    return handoffFailure(intent.action, completionOrigin);
  }
  let result: Awaited<ReturnType<NonNullable<typeof deps.exchange>>>;
  try { result = await (deps.exchange ?? exchangeGoogleManagementCode)({ state, code, ...deps.configuration }); }
  catch { return handoffFailure(intent.action, completionOrigin); }
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
  } catch { return handoffFailure(intent.action, completionOrigin); }
  try {
    const grant = await deps.complete({ ...actor, action: intent.action, stateDigest: intent.stateDigest, verifiedSubject: proof.subject });
    return grant ? success(intent.action, grant.token, completionOrigin) : handoffFailure(intent.action, completionOrigin);
  } catch { return handoffFailure(intent.action, completionOrigin); }
}

export function isGoogleManagementCallback(request: Request): boolean {
  return request.method === "GET"
    && new URL(request.url).pathname === "/api/auth/callback/google"
    && (new URL(request.url).searchParams.get("state")?.startsWith("dayli-management-") ?? false);
}
