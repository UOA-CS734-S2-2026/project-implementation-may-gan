import type { Context, Env } from "hono";
import type { ApiErrorCode } from "@dayli/contracts";

/** Status codes this helper is expected to produce. Extend as new call sites need one. */
export type ApiErrorStatus = 401 | 403 | 404 | 409 | 422 | 429 | 500 | 503;

/**
 * Build a response matching packages/contracts' apiErrorSchema shape. Messages and
 * details must not reveal SQL, stack traces, credentials, provider responses, or
 * private records (docs/dayli/api-conventions.md).
 */
export function apiErrorResponse<E extends Env, S extends ApiErrorStatus>(
  context: Context<E>,
  status: S,
  code: ApiErrorCode,
  message: string,
  details?: Record<string, unknown>,
) {
  return context.json(
    {
      error: { code, message, requestId: crypto.randomUUID(), details },
    },
    status,
  );
}
