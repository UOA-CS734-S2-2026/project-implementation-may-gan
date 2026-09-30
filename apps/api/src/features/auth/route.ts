import type { OpenAPIHono } from "@hono/zod-openapi";
import type { Env } from "hono";
import type { ApiEnv } from "../../env";
import {
  authBasePath,
  createPostgresBetterAuth,
  readBetterAuthRuntimeConfiguration,
  type BetterAuthCompatibilitySlice,
} from "./better-auth";
import {
  createPostgresSocialLinkConfirmationStore,
  type CurrentSocialLinkSession,
  type SocialLinkConfirmationStore,
} from "./social-link-confirmation";
import { withHyperdriveDatabase } from "../../infrastructure/database/hyperdrive";
import { schema } from "@dayli/db";
import { eq } from "drizzle-orm";
import { bindBrowserRegistrationIntent, readCurrentTerms } from "../legal/shared/legal.repository";

const corsMethods = ["GET", "POST"];
const corsHeaders = ["authorization", "content-type", "x-dayli-registration-intent", "x-dayli-registration-binding"];

function appendVary(headers: Headers, value: string) {
  const values = new Set(headers.get("vary")?.split(",").map((item) => item.trim()).filter(Boolean) ?? []);
  values.add(value);
  headers.set("vary", [...values].join(", "));
}

function corsResponse(response: Response, origin: string, preflight = false): Response {
  const headers = new Headers(response.headers);
  headers.set("access-control-allow-origin", origin);
  headers.set("access-control-allow-credentials", "true");
  headers.set("access-control-expose-headers", "set-auth-token");
  appendVary(headers, "Origin");

  if (preflight) {
    headers.set("access-control-allow-methods", `${corsMethods.join(", ")}, OPTIONS`);
    headers.set("access-control-allow-headers", corsHeaders.join(", "));
    appendVary(headers, "Access-Control-Request-Method");
    appendVary(headers, "Access-Control-Request-Headers");
  }

  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

function isAllowedPreflight(request: Request, trustedOrigins: readonly string[]): string | undefined {
  const origin = request.headers.get("origin");
  if (!origin || !trustedOrigins.includes(origin)) return undefined;

  const method = request.headers.get("access-control-request-method")?.toUpperCase();
  if (!method || !corsMethods.includes(method)) return undefined;

  const requestedHeaders = request.headers.get("access-control-request-headers")?.split(",")
    .map((header) => header.trim().toLowerCase()).filter(Boolean) ?? [];
  return requestedHeaders.every((header) => corsHeaders.includes(header)) ? origin : undefined;
}

function linkFailure(status: number) {
  // Do not reflect a password or provider token in an account-linking error.
  return new Response(null, { status });
}

/**
 * Better Auth's /link-social endpoint deliberately accepts any authenticated
 * session. Dayli upgrades that requirement: a password-account holder must
 * prove possession of their current password in the same request. The password
 * is verified by Better Auth against the session's authoritative user, then is
 * removed before the link request reaches Better Auth.
 */
type AuthHandler = (request: Request) => Promise<Response> | Response;

async function readAuthoritativeSession(request: Request, handler: AuthHandler): Promise<CurrentSocialLinkSession | undefined> {
  const sessionResponse = await handler(new Request(new URL(`${authBasePath}/get-session?disableCookieCache=true`, request.url), {
    headers: request.headers,
  }));
  if (!sessionResponse.ok) return undefined;
  const session: unknown = await sessionResponse.json().catch(() => undefined);
  if (!session || typeof session !== "object") return undefined;
  const result = session as { user?: { id?: unknown }; session?: { id?: unknown } };
  return typeof result.user?.id === "string" && typeof result.session?.id === "string"
    ? { userId: result.user.id, sessionId: result.session.id }
    : undefined;
}

function redirectState(response: Response): Promise<string | undefined> {
  return response.clone().json().then((body: unknown) => {
    if (!body || typeof body !== "object" || typeof (body as { url?: unknown }).url !== "string") return undefined;
    return new URL((body as { url: string }).url).searchParams.get("state") ?? undefined;
  }).catch(() => undefined);
}

async function handleProtectedSocialLink(
  request: Request,
  handler: AuthHandler,
  confirmations: SocialLinkConfirmationStore,
): Promise<Response> {
  let body: Record<string, unknown>;
  try {
    const parsed: unknown = await request.json();
    if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") return linkFailure(400);
    body = parsed as Record<string, unknown>;
  } catch {
    return linkFailure(400);
  }

  const password = body.password;
  if (typeof password !== "string" || password.length === 0) return linkFailure(400);

  const headers = new Headers(request.headers);
  headers.set("content-type", "application/json");
  headers.delete("content-length");
  const verification = await handler(new Request(new URL(`${authBasePath}/verify-password`, request.url), {
    method: "POST",
    headers,
    body: JSON.stringify({ password }),
  }));
  if (!verification.ok) return linkFailure(verification.status);

  const linkBody = { ...body };
  delete linkBody.password;
  const response = await handler(new Request(request.url, {
    method: "POST",
    headers,
    body: JSON.stringify(linkBody),
  }));

  // Direct native ID-token links finish in this request. Better Auth reports a
  // database create collision as 417 after its read-then-create check; expose
  // the same conflict result as an already-linked subject instead.
  if (body.idToken !== undefined) return response.status === 417 ? linkFailure(409) : response;
  if (!response.ok) return response;
  // Redirect links get a durable confirmation that can only be consumed by this
  // current session.
  const session = await readAuthoritativeSession(request, handler);
  const state = await redirectState(response);
  if (!session || !state || !await confirmations.issue(state, session)) return linkFailure(400);
  return response;
}

async function handleOAuthCallback(
  request: Request,
  handler: AuthHandler,
  confirmations: SocialLinkConfirmationStore,
): Promise<Response> {
  const state = new URL(request.url).searchParams.get("state");
  if (!state) return handler(request);

  const session = await readAuthoritativeSession(request, handler);
  // A state with no Dayli confirmation is an ordinary Google sign-in callback.
  // A confirmed link must have the same still-live session that verified its password.
  const result = await confirmations.consume(state, session);
  if (result === "absent") return handler(request);
  if (result !== "accepted") return linkFailure(401);
  return handler(request);
}

function registerStrictAuthRoutes<E extends Env>(
  app: OpenAPIHono<E>,
  trustedOrigins: readonly string[],
  dispatch: (request: Request) => Promise<Response>,
) {
  app.on("OPTIONS", `${authBasePath}/*`, (context) => {
    const origin = isAllowedPreflight(context.req.raw, trustedOrigins);
    return origin ? corsResponse(new Response(null, { status: 204 }), origin, true) : new Response(null, { status: 403 });
  });

  app.on(["GET", "POST"], `${authBasePath}/*`, async (context) => {
    const origin = context.req.header("origin");
    if (origin && !trustedOrigins.includes(origin)) return new Response(null, { status: 403 });
    const response = await dispatch(context.req.raw);
    return origin ? corsResponse(response, origin) : response;
  });
}

async function admitRegistration(request: Request, database?: import("@dayli/db").DayliDatabase): Promise<Request | Response> {
  if (!database) return request;
  const path = new URL(request.url).pathname;
  const canCreate = (request.method === "POST" && (path === `${authBasePath}/sign-up/email` || path === `${authBasePath}/sign-in/social`))
    || (request.method === "GET" && path === `${authBasePath}/callback/google`);
  if (!canCreate || !await readCurrentTerms(database)) return request;
  const headers = new Headers(request.headers);
  const forwarded = () => new Request(request, { headers });
  if (request.method === "GET") {
    const state = new URL(request.url).searchParams.get("state");
    if (state) headers.set("x-dayli-registration-browser-state", state);
    return forwarded();
  }
  const body = await request.clone().json().catch(() => undefined) as { idToken?: unknown } | undefined;
  if (path === `${authBasePath}/sign-in/social` && body?.idToken === undefined) return request;
  // Do not consume an intent here. The insert trigger consumes it in the exact
  // transaction that inserts the user and writes both legal records.
  const token = request.headers.get("x-dayli-registration-intent");
  const binding = request.headers.get("x-dayli-registration-binding");
  if (!token || !binding) return path === `${authBasePath}/sign-up/email` ? linkFailure(403) : request;
  return forwarded();
}

async function bindBrowserRegistration(request: Request, response: Response, database?: import("@dayli/db").DayliDatabase): Promise<Response> {
  if (!database || request.method !== "POST" || new URL(request.url).pathname !== `${authBasePath}/sign-in/social`) return response;
  const token = request.headers.get("x-dayli-registration-intent");
  const flowBinding = request.headers.get("x-dayli-registration-binding");
  if (!token || !flowBinding || !response.ok) return response;
  const body = await request.clone().json().catch(() => undefined) as { idToken?: unknown } | undefined;
  // Native ID-token sign-in creates in this request. Browser OAuth must bind
  // Better Auth's server-generated state before its later callback.
  if (!body || body.idToken !== undefined) return response;
  const state = await redirectState(response);
  if (!state || !await bindBrowserRegistrationIntent(database, { token, flowBinding, oauthState: state })) return linkFailure(403);
  return response;
}

async function handleAuthRequest(
  request: Request,
  handler: AuthHandler,
  confirmations: SocialLinkConfirmationStore,
  database?: import("@dayli/db").DayliDatabase,
): Promise<Response> {
  const pathname = new URL(request.url).pathname;
  const admitted = await admitRegistration(request, database);
  if (admitted instanceof Response) return admitted;
  request = admitted;
  if (request.method === "POST" && pathname === `${authBasePath}/link-social`) {
    return handleProtectedSocialLink(request, handler, confirmations);
  }
  if (request.method === "GET" && pathname === `${authBasePath}/callback/google`) {
    return handleOAuthCallback(request, handler, confirmations);
  }
  return bindBrowserRegistration(request, await handler(request), database);
}

export function registerBetterAuthCompatibilityRoutes<E extends Env>(
  app: OpenAPIHono<E>,
  auth: BetterAuthCompatibilitySlice,
) {
  registerStrictAuthRoutes(app, auth.trustedOrigins, (request) => (
    handleAuthRequest(request, (inner) => auth.auth.handler(inner), auth.socialLinkConfirmations)
  ));
}

export interface SessionRevocationHook {
  revokeSessions(userId: string, sessionIds: readonly string[]): Promise<void>;
}

function isSessionRevocationRequest(request: Request): boolean {
  const path = new URL(request.url).pathname;
  return request.method === "POST" && (path === `${authBasePath}/sign-out` || path === `${authBasePath}/revoke-sessions`);
}

/** Register the production authority only after all Worker bindings validate. */
export function registerPostgresBetterAuthRoutes<E extends Env>(app: OpenAPIHono<E>, env: ApiEnv, revocations?: SessionRevocationHook) {
  const configuration = readBetterAuthRuntimeConfiguration(env);
  if (!configuration) return false;

  registerStrictAuthRoutes(app, configuration.trustedOrigins, (request) => withHyperdriveDatabase(
    configuration.hyperdrive,
    async (database) => {
      const auth = createPostgresBetterAuth({
        baseURL: configuration.baseURL,
        secret: configuration.secret,
        trustedOrigins: configuration.trustedOrigins,
        database,
        google: configuration.google,
        resend: configuration.resend,
      });
      const revoke = isSessionRevocationRequest(request) && revocations
        ? await readAuthoritativeSession(request, auth.handler)
        : undefined;
      let sessionIds: string[] = [];
      if (revoke) {
        const stored = await database
          .select({ id: schema.session.id })
          .from(schema.session)
          .where(eq(schema.session.userId, revoke.userId));
        sessionIds = stored.map((row) => row.id);
      }
      const response = await handleAuthRequest(request, (inner) => auth.handler(inner), createPostgresSocialLinkConfirmationStore(database), database);
      if (response.ok && revoke && sessionIds.length > 0) await revocations?.revokeSessions(revoke.userId, sessionIds);
      return response;
    },
  ));
  return true;
}
