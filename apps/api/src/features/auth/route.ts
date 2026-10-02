import type { OpenAPIHono } from "@hono/zod-openapi";
import type { Env } from "hono";
import type { ApiEnv } from "../../env";
import { hasUntrustedBrowserOrigin } from "../../http/middleware/cors";
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
import { schema, type DayliDatabase } from "@dayli/db";
import { bindBrowserRegistrationIntent } from "../legal/shared/registration-intent.repository";
import { eq } from "drizzle-orm";

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

/**
 * Register strict auth origin handling before the ingress limiter. The rate-limit
 * response still reaches trusted browser clients, while unknown origins stop
 * before either the limiter or authentication provider runs.
 */
export function registerStrictAuthCors<E extends Env>(app: OpenAPIHono<E>, trustedOrigins: readonly string[]) {
  app.use(`${authBasePath}/*`, async (context, next) => {
    const origin = context.req.header("origin");
    if (hasUntrustedBrowserOrigin(origin, trustedOrigins)) return new Response(null, { status: 403 });
    await next();
    if (origin && trustedOrigins.includes(origin)) {
      context.res.headers.set("access-control-allow-origin", origin);
      context.res.headers.set("access-control-allow-credentials", "true");
      context.res.headers.set("access-control-expose-headers", "set-auth-token, retry-after");
      appendVary(context.res.headers, "Origin");
    }
  });
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
    if (hasUntrustedBrowserOrigin(origin, trustedOrigins)) return new Response(null, { status: 403 });
    const response = await dispatch(context.req.raw);
    return origin ? corsResponse(response, origin) : response;
  });
}

async function prepareRegistrationRequest(request: Request): Promise<Request> {
  const path = new URL(request.url).pathname;
  const headers = new Headers(request.headers);
  // Internal proof markers cannot be supplied by a browser or native caller.
  headers.delete("x-dayli-native-google-admission");
  headers.delete("x-dayli-registration-browser-state");
  if (request.method === "GET" && path === `${authBasePath}/callback/google`) {
    const state = new URL(request.url).searchParams.get("state");
    if (state && state.length >= 8 && state.length <= 256 && !state.includes("|")) headers.set("x-dayli-registration-browser-state", state);
  }
  if (request.method === "POST" && path === `${authBasePath}/sign-in/social`) {
    const body: unknown = await request.clone().json().catch(() => undefined);
    if (body && typeof body === "object" && !Array.isArray(body) && (body as { provider?: unknown }).provider === "google") {
      const idToken = (body as { idToken?: unknown }).idToken;
      if (idToken && typeof idToken === "object" && typeof (idToken as { token?: unknown }).token === "string") {
        headers.set("x-dayli-native-google-admission", "1");
      }
    }
  }
  return new Request(request, { headers });
}

async function bindBrowserSignupResponse(request: Request, response: Response, database: DayliDatabase): Promise<Response> {
  if (request.method !== "POST" || new URL(request.url).pathname !== `${authBasePath}/sign-in/social` || !response.ok) return response;
  if (request.headers.get("x-dayli-native-google-admission") === "1") return response;
  const token = request.headers.get("x-dayli-registration-intent");
  const binding = request.headers.get("x-dayli-registration-binding");
  if (!token && !binding) return response;
  const state = await redirectState(response);
  return token && binding && state && await bindBrowserRegistrationIntent(database, token, binding, state)
    ? response : linkFailure(403);
}

async function handleAuthRequest(
  request: Request,
  handler: AuthHandler,
  confirmations: SocialLinkConfirmationStore,
): Promise<Response> {
  const pathname = new URL(request.url).pathname;
  if (request.method === "POST" && pathname === `${authBasePath}/link-social`) {
    return handleProtectedSocialLink(request, handler, confirmations);
  }
  if (request.method === "GET" && pathname === `${authBasePath}/callback/google`) {
    return handleOAuthCallback(request, handler, confirmations);
  }
  return handler(request);
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

class RollbackRegistrationResponse extends Error {
  constructor(readonly response: Response) {
    super("Registration did not complete.");
  }
}

function isRegistrationAuthRequest(request: Request): boolean {
  const path = new URL(request.url).pathname;
  return (request.method === "POST" && path === `${authBasePath}/sign-up/email`)
    || (request.method === "POST" && path === `${authBasePath}/sign-in/social` && request.headers.get("x-dayli-native-google-admission") === "1")
    || (request.method === "GET" && path === `${authBasePath}/callback/google`);
}

function registrationAuthSucceeded(request: Request, response: Response): boolean {
  if (request.method !== "GET") return response.ok;
  if (response.status < 300 || response.status >= 400) return false;
  // Better Auth sets the signed session cookie only after an OAuth account
  // and session exist. A caller-controlled callback URL can contain `error`.
  const headers = response.headers as Headers & { getSetCookie?: () => string[] };
  const cookies = headers.getSetCookie?.() ?? [headers.get("set-cookie") ?? ""];
  return cookies.some((cookie) => /(?:^|,\s*)(?:__Secure-|__Host-)?better-auth\.session_token=[^;,\s]+/.test(cookie));
}

/** Register the production authority only after all Worker bindings validate. */
export function registerPostgresBetterAuthRoutes<E extends Env>(app: OpenAPIHono<E>, env: ApiEnv, revocations?: SessionRevocationHook) {
  const configuration = readBetterAuthRuntimeConfiguration(env);
  if (!configuration) return false;

  registerStrictAuthRoutes(app, configuration.trustedOrigins, (request) => withHyperdriveDatabase(
    configuration.hyperdrive,
    async (database) => {
      const prepared = await prepareRegistrationRequest(request);
      const dispatch = async (authDatabase: DayliDatabase) => {
        const auth = createPostgresBetterAuth({
          baseURL: configuration.baseURL,
          secret: configuration.secret,
          trustedOrigins: configuration.trustedOrigins,
          database: authDatabase,
          google: configuration.google,
          resend: configuration.resend,
        });
        const revoke = isSessionRevocationRequest(request) && revocations
          ? await readAuthoritativeSession(request, auth.handler)
          : undefined;
        let sessionIds: string[] = [];
        if (revoke) {
          const stored = await authDatabase
            .select({ id: schema.session.id })
            .from(schema.session)
            .where(eq(schema.session.userId, revoke.userId));
          sessionIds = stored.map((row) => row.id);
        }
        const response = await handleAuthRequest(prepared, (inner) => auth.handler(inner), createPostgresSocialLinkConfirmationStore(authDatabase));
        if (response.ok && revoke && sessionIds.length > 0) await revocations?.revokeSessions(revoke.userId, sessionIds);
        return bindBrowserSignupResponse(prepared, response, authDatabase);
      };
      if (!isRegistrationAuthRequest(prepared)) return dispatch(database);
      // Better Auth inserts the user, account, and session in separate calls.
      // Keep all three, plus trigger-owned legal evidence, in one transaction.
      try {
        return await database.transaction(async (tx) => {
          const response = await dispatch(tx as DayliDatabase);
          if (!registrationAuthSucceeded(prepared, response)) throw new RollbackRegistrationResponse(response);
          return response;
        });
      } catch (error) {
        if (error instanceof RollbackRegistrationResponse) return error.response;
        throw error;
      }
    },
  ));
  return true;
}
