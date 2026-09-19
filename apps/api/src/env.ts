import type { HyperdriveBinding } from "@dayli/db";

/** Runtime bindings required before PostgreSQL-backed Better Auth is mounted. */
export interface ApiEnv {
  HYPERDRIVE: HyperdriveBinding;
  BETTER_AUTH_SECRET: string;
  BETTER_AUTH_BASE_URL: string;
  BETTER_AUTH_TRUSTED_ORIGINS: string;
  GOOGLE_WEB_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  GOOGLE_IOS_CLIENT_ID?: string;
  GOOGLE_ANDROID_CLIENT_ID?: string;
  RESEND_API_KEY?: string;
  RESEND_FROM?: string;
}
