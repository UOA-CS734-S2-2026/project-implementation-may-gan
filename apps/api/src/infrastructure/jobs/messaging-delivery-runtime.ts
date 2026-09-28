import type { HyperdriveBinding } from "@dayli/db";
import { createDurableObjectRealtimePublisher } from "../realtime/publisher";
import { createFcmHttpV1Sender, type FcmServiceAccount } from "../push/fcm";
import { createHyperdrivePushDestinationResolver } from "../push/push-destination.repository";
import { createPushOutboxHandler } from "../push/push-dispatcher";
import { createOutboxDispatcher } from "./dispatch-outbox";
import { createHyperdriveOutboxStore } from "./outbox-store";

export interface MessagingDeliveryBindings {
  HYPERDRIVE: HyperdriveBinding;
  USER_REALTIME: DurableObjectNamespace;
  /** JSON service account stored only in a Worker secret. */
  FCM_SERVICE_ACCOUNT_JSON?: string;
}

/** Builds independent realtime and push handlers. Missing FCM config never blocks realtime jobs. */
export function createMessagingDeliveryDispatcher(env: MessagingDeliveryBindings) {
  const realtime = createDurableObjectRealtimePublisher(env.USER_REALTIME);
  const push = env.FCM_SERVICE_ACCOUNT_JSON ? configuredPushHandler(env) : async () => ({ ok: false as const, retryable: true, category: "unauthorized" as const });
  return createOutboxDispatcher({
    store: createHyperdriveOutboxStore(env.HYPERDRIVE),
    handlers: { realtime: realtime.deliver, push },
  });
}

function configuredPushHandler(env: MessagingDeliveryBindings) {
  let account: FcmServiceAccount;
  try { account = JSON.parse(env.FCM_SERVICE_ACCOUNT_JSON!) as FcmServiceAccount; }
  catch { return async () => ({ ok: false as const, retryable: true, category: "unauthorized" as const }); }
  if (!account.clientEmail || !account.privateKey || !account.projectId) return async () => ({ ok: false as const, retryable: true, category: "unauthorized" as const });
  return createPushOutboxHandler({
    destinations: createHyperdrivePushDestinationResolver(env.HYPERDRIVE),
    sender: createFcmHttpV1Sender({ serviceAccount: account }),
  });
}
