import type { Env } from "hono";

/** Identity established by Better Auth, never request input. */
export interface AuthenticatedActor {
  userId: string;
}

/** Hono environment for routes that read the verified authenticated actor. */
export interface AuthenticatedApiEnv extends Env {
  Variables: {
    actor: AuthenticatedActor;
  };
}
