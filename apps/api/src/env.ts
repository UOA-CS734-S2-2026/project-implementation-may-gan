import type { HyperdriveBinding } from "@dayli/db";
import type { RateLimitBinding } from "./http/middleware/rate-limit";

/** Runtime bindings required before PostgreSQL-backed Better Auth is mounted. */
export interface ApiEnv {
  HYPERDRIVE: HyperdriveBinding;
  /** Restricted lifecycle_worker connection. Never reuse the ordinary app binding. */
  EXPORT_WORKER_HYPERDRIVE?: HyperdriveBinding;
  BETTER_AUTH_SECRET: string;
  BETTER_AUTH_BASE_URL: string;
  /** Direct API origin for native callers and issued realtime ticket URLs. */
  PUBLIC_API_BASE_URL?: string;
  BETTER_AUTH_TRUSTED_ORIGINS: string;
  GOOGLE_WEB_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  GOOGLE_IOS_CLIENT_ID?: string;
  GOOGLE_ANDROID_CLIENT_ID?: string;
  RESEND_API_KEY?: string;
  RESEND_FROM?: string;
  R2_ACCOUNT_ID?: string;
  R2_BUCKET_NAME?: string;
  R2_ACCESS_KEY_ID?: string;
  R2_SECRET_ACCESS_KEY?: string;
  /** Required in deployed delivery environments. Optional for DB-free and legacy test composition. */
  USER_REALTIME?: DurableObjectNamespace;
  /** Worker secret containing a Firebase service-account JSON document. */
  FCM_SERVICE_ACCOUNT_JSON?: string;
  /** Base64 256-bit key used to envelope-encrypt mobile push tokens. */
  PUSH_TOKEN_ENCRYPTION_KEY?: string;
  /** Public environment scope used to keep native rate-limit keys separate. */
  API_RATE_LIMIT_SCOPE?: string;
  /** Native Cloudflare rate-limit bindings. Missing bindings fail API rate limiting closed. */
  API_INGRESS_RATE_LIMIT?: RateLimitBinding;
  API_READ_RATE_LIMIT?: RateLimitBinding;
  API_WRITE_RATE_LIMIT?: RateLimitBinding;
  API_MESSAGE_RATE_LIMIT?: RateLimitBinding;
  API_MEDIA_RATE_LIMIT?: RateLimitBinding;
  API_REALTIME_RATE_LIMIT?: RateLimitBinding;
  API_DIRECT_PUSH_RATE_LIMIT?: RateLimitBinding;
}
