import type { ApiEnv } from "../../env";
import { realtimeRevocationBindingFailure } from "../jobs/account-realtime-revocation";
import { normalizeFcmServiceAccount } from "./fcm";
import { createWorkerPushTokenProtector } from "./token-encryption";

/** Booleans and fixed labels only. No identifiers or secret values leave this projection. */
export async function notificationRuntimeProof(env: Partial<ApiEnv>) {
  if (env.API_RATE_LIMIT_SCOPE !== "staging") throw new Error("Notification runtime diagnostics are staging-only.");
  let credentialsShapeValid = false;
  try { credentialsShapeValid = Boolean(normalizeFcmServiceAccount(JSON.parse(env.FCM_SERVICE_ACCOUNT_JSON ?? ""))); }
  catch { /* Invalid documents are reported only as false. */ }
  return {
    publishersEnabled: env.NOTIFICATION_PUBLISHERS_ENABLED === "true",
    deliveryEnabled: env.NOTIFICATION_DELIVERY_ENABLED === "true",
    credentialsPresent: Boolean(env.FCM_SERVICE_ACCOUNT_JSON),
    credentialsShapeValid,
    tokenProtectionAvailable: Boolean(await createWorkerPushTokenProtector(env.PUSH_TOKEN_ENCRYPTION_KEY)),
    realtimePresent: Boolean(env.USER_REALTIME),
    appDatabasePresent: Boolean(env.HYPERDRIVE),
    workerDatabasePresent: Boolean(env.EXPORT_WORKER_HYPERDRIVE),
    revocationBindingFailure: realtimeRevocationBindingFailure(env) ?? "none",
  };
}
