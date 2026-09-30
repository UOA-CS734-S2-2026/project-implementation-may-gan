import rateLimitBindingConfig from "../../../rate-limit-bindings.json";
import type { Context, Env, MiddlewareHandler } from "hono";
import { apiErrorResponse } from "../api-error";
import type { AuthenticatedActor } from "../authenticated-actor";

export interface RateLimitBinding {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}

type RateLimitBindingName = "ingress" | "read" | "write" | "message" | "media" | "realtime" | "directPush";

export const rateLimitBindings = Object.fromEntries(
  rateLimitBindingConfig.map(({ key, ...binding }) => [key, binding]),
) as Record<RateLimitBindingName, Omit<(typeof rateLimitBindingConfig)[number], "key">>;
type RateLimitBindings = Partial<Record<RateLimitBindingName, RateLimitBinding>>;

export type RateLimitDecision = "allowed" | "denied" | "unavailable";

export interface ActorRateLimiter {
  check(request: Request, actor: AuthenticatedActor): Promise<RateLimitDecision>;
}

export interface ApiRateLimitDependencies {
  /** A public, environment-specific namespace prefix, such as "staging". */
  environmentScope?: string;
  bindings?: RateLimitBindings;
  onOperationalAlert?: (message: "rate_limit_backend_unavailable") => void;
}

interface ActionRateLimitPolicy {
  action: string;
  binding: Exclude<RateLimitBindingName, "ingress" | "read" | "write">;
}

const retryAfterSeconds = Math.max(...Object.values(rateLimitBindings).map((binding) => binding.period));

/** Return the narrowly targeted policy for the expensive abuse-prone operations. */
export function rateLimitActionFor(request: Request): ActionRateLimitPolicy | undefined {
  const { pathname } = new URL(request.url);
  const method = request.method.toUpperCase();
  if (method === "POST" && /^\/api\/v1\/conversations\/[^/]+\/messages$/.test(pathname)) return { action: "send_message", binding: "message" };
  if (method === "POST" && pathname === "/api/v1/conversations/direct") return { action: "create_direct_conversation", binding: "directPush" };
  if (method === "POST" && pathname === "/api/v1/realtime/tickets") return { action: "create_realtime_ticket", binding: "realtime" };
  if (method === "GET" && pathname === "/api/v1/realtime/connect") return { action: "connect_realtime", binding: "realtime" };
  if (method === "PUT" && /^\/api\/v1\/push\/devices\/[^/]+$/.test(pathname)) return { action: "register_push_device", binding: "directPush" };
  if (method === "POST" && pathname === "/api/v1/media-reservations") return { action: "reserve_media_upload", binding: "media" };
  if (method === "POST" && /^\/api\/v1\/media-reservations\/[^/]+\/complete$/.test(pathname)) return { action: "complete_media_upload", binding: "media" };
  return undefined;
}

function hasScope(scope: string | undefined): scope is string {
  return typeof scope === "string" && /^[a-z0-9][a-z0-9_-]{0,63}$/.test(scope);
}

function ingressUnavailable(dependencies: ApiRateLimitDependencies) {
  return !hasScope(dependencies.environmentScope) || !dependencies.bindings?.ingress;
}

function actorUnavailable(dependencies: ApiRateLimitDependencies) {
  return ingressUnavailable(dependencies)
    || !dependencies.bindings?.read
    || !dependencies.bindings?.write
    || !dependencies.bindings?.message
    || !dependencies.bindings?.media
    || !dependencies.bindings?.realtime
    || !dependencies.bindings?.directPush;
}

function key(scope: string, value: string) {
  return `environment:${scope}:${value}`;
}

async function limit(
  binding: RateLimitBinding,
  keyValue: string,
  onOperationalAlert: ApiRateLimitDependencies["onOperationalAlert"],
): Promise<RateLimitDecision> {
  try {
    return (await binding.limit({ key: keyValue })).success ? "allowed" : "denied";
  } catch {
    // The native limiter has no precise reset value. Continue during an outage and alert without a key or identity.
    onOperationalAlert?.("rate_limit_backend_unavailable");
    return "allowed";
  }
}

/**
 * Enforce actor buckets after Better Auth established a server-verified identity.
 * A missing production binding fails closed. A transient native limiter outage fails open.
 */
export function createActorRateLimiter(dependencies: ApiRateLimitDependencies): ActorRateLimiter {
  return {
    async check(request, actor) {
      if (actorUnavailable(dependencies)) return "unavailable";
      const bindings = dependencies.bindings!;
      const scope = dependencies.environmentScope!;
      const general = request.method === "GET" || request.method === "HEAD" ? bindings.read! : bindings.write!;
      const generalDecision = await limit(general, key(scope, `actor:${actor.userId}`), dependencies.onOperationalAlert);
      if (generalDecision !== "allowed") return generalDecision;
      const policy = rateLimitActionFor(request);
      return policy
        ? limit(bindings[policy.binding]!, key(scope, `action:${policy.action}:actor:${actor.userId}`), dependencies.onOperationalAlert)
        : "allowed";
    },
  };
}

/**
 * Apply a generous shared-IP guard before authentication performs database work.
 * CF-Connecting-IP is supplied by Cloudflare at the Worker ingress, never from a
 * client-controlled forwarding header. Requests without it fail closed in deployed
 * configurations rather than sharing an anonymous bucket.
 */
export function createIngressRateLimitMiddleware<E extends Env>(dependencies: ApiRateLimitDependencies): MiddlewareHandler<E> {
  return async (context, next) => {
    const request = context.req.raw;
    const pathname = new URL(request.url).pathname;
    if (request.method === "OPTIONS" || pathname === "/api/v1/health") return next();
    if (ingressUnavailable(dependencies)) return unavailableResponse(context);
    const ip = request.headers.get("cf-connecting-ip");
    if (!ip) return unavailableResponse(context);
    const decision = await limit(
      dependencies.bindings!.ingress!,
      key(dependencies.environmentScope!, `ingress:${ip}`),
      dependencies.onOperationalAlert,
    );
    if (decision === "allowed") return next();
    if (decision === "unavailable") return unavailableResponse(context);
    return rateLimitedResponse(context);
  };
}

function rateLimitDetails() {
  return { retryAfterSeconds };
}

export function rateLimitedResponse<E extends Env>(context: Context<E>) {
  context.header("Cache-Control", "no-store");
  context.header("Retry-After", String(retryAfterSeconds));
  return apiErrorResponse(context, 429, "RATE_LIMITED", "Too many requests. Try again later.", rateLimitDetails());
}

export function unavailableResponse<E extends Env>(context: Context<E>) {
  context.header("Cache-Control", "no-store");
  return apiErrorResponse(context, 503, "SERVICE_UNAVAILABLE", "Request rate limiting is temporarily unavailable.");
}

export function rateLimitedFetchResponse() {
  return new Response(JSON.stringify({
    error: { code: "RATE_LIMITED", message: "Too many requests. Try again later.", requestId: crypto.randomUUID(), details: rateLimitDetails() },
  }), {
    status: 429,
    headers: { "Cache-Control": "no-store", "Content-Type": "application/json", "Retry-After": String(retryAfterSeconds) },
  });
}

export function unavailableFetchResponse() {
  return new Response(JSON.stringify({
    error: { code: "SERVICE_UNAVAILABLE", message: "Request rate limiting is temporarily unavailable.", requestId: crypto.randomUUID() },
  }), {
    status: 503,
    headers: { "Cache-Control": "no-store", "Content-Type": "application/json" },
  });
}

export type { ActionRateLimitPolicy, RateLimitBindings };
