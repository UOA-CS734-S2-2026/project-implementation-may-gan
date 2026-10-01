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
  /** Dedicated account-management proof keys. They are never used for Better Auth sign-in. */
  GOOGLE_PROOF_VERIFIER_ENCRYPTION_KEY?: string;
  GOOGLE_PROOF_VERIFIER_KEY_VERSION?: string;
  GOOGLE_PROOF_SUBJECT_HMAC_KEY?: string;
  GOOGLE_PROOF_SUBJECT_KEY_VERSION?: string;
  GOOGLE_PROOF_COMPLETION_URL?: string;
  RESEND_API_KEY?: string;
  RESEND_FROM?: string;
  R2_ACCOUNT_ID?: string;
  R2_BUCKET_NAME?: string;
  R2_ACCESS_KEY_ID?: string;
  R2_SECRET_ACCESS_KEY?: string;
  /** Exact opt-in for accepting new export jobs. Missing or invalid is disabled. */
  DATA_EXPORT_REQUESTS_ENABLED?: string;
  /** Separate restricted-role Hyperdrive binding for the offline export worker. */
  DATA_EXPORT_WORKER_HYPERDRIVE?: HyperdriveBinding;
  /** Exact disabled-by-default scheduler and request readiness opt-in. */
  DATA_EXPORT_WORKER_ENABLED?: string;
  /** Required in deployed delivery environments. Optional for DB-free and legacy test composition. */
  USER_REALTIME?: DurableObjectNamespace;
  /** Worker secret containing a Firebase service-account JSON document. */
  FCM_SERVICE_ACCOUNT_JSON?: string;
  /** Base64 256-bit key used to envelope-encrypt mobile push tokens. */
  PUSH_TOKEN_ENCRYPTION_KEY?: string;
}
