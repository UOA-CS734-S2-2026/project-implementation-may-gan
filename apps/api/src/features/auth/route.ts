import type { OpenAPIHono } from "@hono/zod-openapi";
import type { ApiEnv } from "../../env";
import {
  authBasePath,
  handlePostgresBetterAuthRequest,
  readBetterAuthRuntimeConfiguration,
  type BetterAuthCompatibilitySlice,
} from "./better-auth";

const corsMethods = ["GET", "POST"];
const corsHeaders = ["authorization", "content-type"];

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

function registerStrictAuthRoutes(
  app: OpenAPIHono,
  trustedOrigins: readonly string[],
  handler: (request: Request) => Promise<Response> | Response,
) {
  app.on("OPTIONS", `${authBasePath}/*`, (context) => {
    const origin = isAllowedPreflight(context.req.raw, trustedOrigins);
    return origin ? corsResponse(new Response(null, { status: 204 }), origin, true) : new Response(null, { status: 403 });
  });

  app.on(["GET", "POST"], `${authBasePath}/*`, async (context) => {
    const origin = context.req.header("origin");
    if (origin && !trustedOrigins.includes(origin)) return new Response(null, { status: 403 });

    const response = await handler(context.req.raw);
    return origin ? corsResponse(response, origin) : response;
  });
}

export function registerBetterAuthCompatibilityRoutes(
  app: OpenAPIHono,
  auth: BetterAuthCompatibilitySlice,
) {
  registerStrictAuthRoutes(app, auth.trustedOrigins, (request) => auth.auth.handler(request));
}

/** Register the production authority only after all Worker bindings validate. */
export function registerPostgresBetterAuthRoutes(app: OpenAPIHono, env: ApiEnv) {
  const configuration = readBetterAuthRuntimeConfiguration(env);
  if (!configuration) return false;

  registerStrictAuthRoutes(app, configuration.trustedOrigins, (request) => (
    handlePostgresBetterAuthRequest(request, configuration)
  ));
  return true;
}
