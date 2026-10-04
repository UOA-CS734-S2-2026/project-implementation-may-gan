import type { HyperdriveBinding } from "@dayli/db";
import { createFcmHttpV1Sender, normalizeFcmServiceAccount } from "../push/fcm";
import { createWorkerPushTokenProtector } from "../push/token-encryption";
import { createHyperdriveNotificationResolver } from "./notification-resolver";
import { createNotificationDispatcher, type NotificationDispatcher } from "./notification-dispatcher";
import { createHyperdriveNotificationStore } from "./notification-store";

export interface NotificationDeliveryBindings {
  HYPERDRIVE: HyperdriveBinding;
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
  if (env.NOTIFICATION_DELIVERY_ENABLED !== "true" || !env.FCM_SERVICE_ACCOUNT_JSON) return disabledDispatcher;
  const protector = await createWorkerPushTokenProtector(env.PUSH_TOKEN_ENCRYPTION_KEY);
  if (!protector) return disabledDispatcher;
  let account;
  try { account = normalizeFcmServiceAccount(JSON.parse(env.FCM_SERVICE_ACCOUNT_JSON)); }
  catch { return disabledDispatcher; }
  if (!account) return disabledDispatcher;
  const fcm = createFcmHttpV1Sender({ serviceAccount: account });
  return createNotificationDispatcher({
    store: createHyperdriveNotificationStore(env.HYPERDRIVE),
    resolver: createHyperdriveNotificationResolver(env.HYPERDRIVE, protector),
    sender: { send: (notification, options) => fcm.sendGeneric(notification, options) },
  });
}
