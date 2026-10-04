import type { HyperdriveBinding } from "@dayli/db";
import type { RateLimitBinding } from "./http/middleware/rate-limit";

/** Runtime bindings required before PostgreSQL-backed Better Auth is mounted. */
export interface ApiEnv {
  HYPERDRIVE: HyperdriveBinding;
  /** Restricted lifecycle_worker connection. Never reuse the ordinary app binding. */
  EXPORT_WORKER_HYPERDRIVE?: HyperdriveBinding;
  /** Staging-only synthetic export proof. Never set in production. */
  STAGING_EXPORT_ALL_USERS_APPROVED?: string;
  STAGING_EXPORT_CLEANUP_ONLY_APPROVED?: string;
  STAGING_EXPORT_PROOF_APPROVED?: string;
  STAGING_EXPORT_PROOF_USER_ID?: string;
  STAGING_EXPORT_PROOF_BUILD_UNTIL?: string;
  STAGING_EXPORT_PROOF_CLEANUP_REVIEW_AFTER?: string;
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
  /** Disposable loopback S3 fixture used only by isolated local E2E runs. */
  R2_LOCAL_ENDPOINT?: string;
  /** Required in deployed delivery environments. Optional for DB-free and legacy test composition. */
  USER_REALTIME?: DurableObjectNamespace;
  /** Exact string "true" enables generic notification publishers. All other values disable them. */
  NOTIFICATION_PUBLISHERS_ENABLED?: string;
  /** Exact string "true" enables both legacy and generic provider delivery. */
  NOTIFICATION_DELIVERY_ENABLED?: string;
  /** Worker secret containing a Firebase service-account JSON document. */
  FCM_SERVICE_ACCOUNT_JSON?: string;
  /** Base64 256-bit key used to envelope-encrypt mobile push tokens. */
  PUSH_TOKEN_ENCRYPTION_KEY?: string;
  /** Persistent sender-wide direct-message quota. Zero disables it. */
  DIRECT_MESSAGE_SEND_LIMIT?: string;
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

/** Missing, malformed, and differently cased values fail closed. */
export function notificationPublishersEnabled(env: Pick<ApiEnv, "NOTIFICATION_PUBLISHERS_ENABLED">): boolean {
  return env.NOTIFICATION_PUBLISHERS_ENABLED === "true";
}
