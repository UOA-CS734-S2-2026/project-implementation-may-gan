import type { DayliDatabase } from "@dayli/db";
import { createPostgresBetterAuth } from "../../features/auth/better-auth";

/** The subset of Better Auth runtime configuration session resolution needs. */
export interface SessionRuntimeConfiguration {
  baseURL: string;
  secret: string;
  trustedOrigins: string[];
}

export interface AuthenticatedUser {
  userId: string;
}

/**
 * Resolve the caller's session using the same Better Auth authority as /api/auth/*.
 * Returns undefined for a missing, malformed, or expired session — callers must
 * respond 401 rather than distinguish the reason (docs/dayli/api-conventions.md).
 */
export async function resolveSession(
  request: Request,
  configuration: SessionRuntimeConfiguration,
  database: DayliDatabase,
): Promise<AuthenticatedUser | undefined> {
  const auth = createPostgresBetterAuth({ ...configuration, database });
  const result = await auth.api.getSession({ headers: request.headers });
  return result?.user?.id ? { userId: result.user.id } : undefined;
}
