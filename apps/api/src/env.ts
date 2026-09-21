import type { HyperdriveBinding } from "@dayli/db";

/** Runtime bindings required before PostgreSQL-backed Better Auth is mounted. */
export interface ApiEnv {
  HYPERDRIVE: HyperdriveBinding;
  BETTER_AUTH_SECRET: string;
  BETTER_AUTH_BASE_URL: string;
  BETTER_AUTH_TRUSTED_ORIGINS: string;
}
