import type { MiddlewareHandler } from "hono";
import { apiErrorResponse } from "../api-error";
import type { AuthenticatedApiEnv } from "../authenticated-actor";

/** Checks whether an authenticated actor has completed public username setup. */
export type HasUsername = (userId: string) => Promise<boolean>;
export type UsernameSetupStatus = "ready" | "missing" | "unavailable";

/** Treat lookup failures as unavailable, never as authorization failures. */
export async function usernameSetupStatus(
  hasUsername: HasUsername | undefined,
  userId: string,
): Promise<UsernameSetupStatus> {
  if (!hasUsername) return "ready";
  try {
    return await hasUsername(userId) ? "ready" : "missing";
  } catch {
    return "unavailable";
  }
}

/** Blocks product features until a user has selected their public handle. */
export function createRequireUsername(
  hasUsername: HasUsername | undefined,
  message = "Choose a username before using messaging.",
): MiddlewareHandler<AuthenticatedApiEnv> {
  return async (context, next) => {
    const status = await usernameSetupStatus(hasUsername, context.get("actor").userId);
    if (status === "unavailable") {
      return apiErrorResponse(context, 503, "SERVICE_UNAVAILABLE", "Username setup is temporarily unavailable.");
    }
    if (status === "missing") {
      return apiErrorResponse(context, 403, "FORBIDDEN", message);
    }
    await next();
  };
}
