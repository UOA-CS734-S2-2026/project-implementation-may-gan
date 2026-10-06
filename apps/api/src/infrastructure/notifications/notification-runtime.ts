import type { HyperdriveBinding } from "@dayli/db";
import { createFcmHttpV1Sender, normalizeFcmServiceAccount } from "../push/fcm";
import { createWorkerPushTokenProtector } from "../push/token-encryption";
import { createHyperdriveNotificationResolver } from "./notification-resolver";
import { createNotificationDispatcher, type NotificationDispatcher } from "./notification-dispatcher";
import { createHyperdriveNotificationStore } from "./notification-store";

export interface NotificationDeliveryBindings {
  HYPERDRIVE: HyperdriveBinding;
  API_RATE_LIMIT_SCOPE?: string;
  NOTIFICATION_DELIVERY_ENABLED?: string;
  FCM_SERVICE_ACCOUNT_JSON?: string;
  PUSH_TOKEN_ENCRYPTION_KEY?: string;
}

const empty = () => ({ claimed: 0, delivered: 0, suppressed: 0, rescheduled: 0, failed: 0, fenced: 0, released: 0 });
const disabledDispatcher: NotificationDispatcher = {
  dispatchImmediately: async () => empty(),
  dispatchScheduled: async () => empty(),
};

/** Missing flags, token protection, or Firebase credentials fail closed before claims. */
export async function createNotificationDeliveryDispatcher(
  env: NotificationDeliveryBindings,
): Promise<NotificationDispatcher> {
  const diagnostics = env.API_RATE_LIMIT_SCOPE === "staging";
  const configurationFailure = (reason: "credentials_missing" | "credentials_invalid" | "token_protection_unavailable") => {
    if (diagnostics) console.info("notification delivery diagnostics", { stage: "configuration", outcome: reason });
    return disabledDispatcher;
  };
  if (env.NOTIFICATION_DELIVERY_ENABLED !== "true") return disabledDispatcher;
  if (!env.FCM_SERVICE_ACCOUNT_JSON) return configurationFailure("credentials_missing");
  const protector = await createWorkerPushTokenProtector(env.PUSH_TOKEN_ENCRYPTION_KEY);
  if (!protector) return configurationFailure("token_protection_unavailable");
  let account;
  try { account = normalizeFcmServiceAccount(JSON.parse(env.FCM_SERVICE_ACCOUNT_JSON)); }
  catch { return configurationFailure("credentials_invalid"); }
  if (!account) return configurationFailure("credentials_invalid");
  const fcm = createFcmHttpV1Sender({
    serviceAccount: account,
    onTrace: diagnostics ? (value) => console.info("notification delivery trace", value) : undefined,
    onDiagnostic: diagnostics ? (value) => console.info("notification delivery diagnostics", value) : undefined,
  });
  const dispatcher = createNotificationDispatcher({
    store: createHyperdriveNotificationStore(env.HYPERDRIVE),
    resolver: createHyperdriveNotificationResolver(env.HYPERDRIVE, protector),
    sender: { send: (notification, options) => fcm.sendGeneric(notification, options) },
    onTrace: diagnostics ? (value) => console.info("notification dispatch trace", value) : undefined,
    onDiagnostic: diagnostics ? (value) => console.info("notification delivery diagnostics", value) : undefined,
  });
  const report = async (mode: "immediate" | "scheduled") => {
    const summary = await (mode === "immediate" ? dispatcher.dispatchImmediately() : dispatcher.dispatchScheduled());
    if (diagnostics && summary.claimed > 0) console.info("notification delivery summary", { mode, ...summary });
    return summary;
  };
  return {
    dispatchImmediately: () => report("immediate"),
    dispatchScheduled: () => report("scheduled"),
  };
}
