import type { OpenAPIHono } from "@hono/zod-openapi";

const allowedMethods = ["GET", "POST", "PATCH", "DELETE"];
const allowedHeaders = ["authorization", "content-type", "idempotency-key"];
const exposedHeaders = ["idempotent-replayed"];
const applicationPath = "/api/v1/*";

function appendVary(headers: Headers, value: string) {
  const values = new Set(headers.get("vary")?.split(",").map((item) => item.trim()).filter(Boolean) ?? []);
  values.add(value);
  headers.set("vary", [...values].join(", "));
}

/**
 * Credentialed CORS for browser clients on exactly the trusted web origins.
 * Requests from any other origin receive no CORS headers, so browsers withhold
 * the response; non-browser clients send no Origin and are unaffected.
 */
export function registerApplicationCors(app: OpenAPIHono, trustedOrigins: readonly string[]) {
  app.use(applicationPath, async (context, next) => {
    const origin = context.req.header("origin");
    const trusted = origin !== undefined && trustedOrigins.includes(origin);

    if (context.req.method === "OPTIONS") {
      const method = context.req.header("access-control-request-method")?.toUpperCase();
      const requestedHeaders = context.req.header("access-control-request-headers")?.split(",")
        .map((header) => header.trim().toLowerCase()).filter(Boolean) ?? [];
      const allowed = trusted
        && method !== undefined
        && allowedMethods.includes(method)
        && requestedHeaders.every((header) => allowedHeaders.includes(header));
      if (!allowed) return new Response(null, { status: 403 });

      const headers = new Headers({
        "access-control-allow-origin": origin,
        "access-control-allow-credentials": "true",
        "access-control-allow-methods": `${allowedMethods.join(", ")}, OPTIONS`,
        "access-control-allow-headers": allowedHeaders.join(", "),
        "access-control-max-age": "600",
      });
      appendVary(headers, "Origin");
      appendVary(headers, "Access-Control-Request-Method");
      appendVary(headers, "Access-Control-Request-Headers");
      return new Response(null, { status: 204, headers });
    }

    await next();
    appendVary(context.res.headers, "Origin");
    if (trusted) {
      context.res.headers.set("access-control-allow-origin", origin);
      context.res.headers.set("access-control-allow-credentials", "true");
      context.res.headers.set("access-control-expose-headers", exposedHeaders.join(", "));
    }
  });
}
