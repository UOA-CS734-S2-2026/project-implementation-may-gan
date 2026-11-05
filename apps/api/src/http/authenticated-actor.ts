import type { Env } from "hono";
import type { AccountPolicy } from "../features/account-policy/shared/account-policy";

/** Identity established by Better Auth, never request input. */
export interface AuthenticatedActor {
  userId: string;
  /** The verified Better Auth session, required for action-bound grants. */
  sessionId?: string;
}

/** Hono environment for routes that require a verified authenticated actor. */
export interface AuthenticatedApiEnv extends Env {
  Variables: {
    actor: AuthenticatedActor;
    /** Policy verified for this request's actor, never reused across requests. */
    accountPolicy?: AccountPolicy;
  };
}

/** Hono environment for public reads whose verified actor may be absent. */
export interface OptionalAuthenticatedApiEnv extends Env {
  Variables: {
    actor: AuthenticatedActor | null;
  };
}
