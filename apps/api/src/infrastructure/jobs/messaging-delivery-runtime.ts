import type { HyperdriveBinding } from "@dayli/db";
import { createDurableObjectRealtimePublisher } from "../realtime/publisher";
import { createFcmHttpV1Sender, normalizeFcmServiceAccount } from "../push/fcm";
import { createHyperdrivePushDestinationResolver } from "../push/push-destination.repository";
import { createPushOutboxHandler } from "../push/push-dispatcher";
import { createWorkerPushTokenProtector } from "../push/token-encryption";
import { createOutboxDispatcher } from "./dispatch-outbox";
import { createHyperdriveOutboxStore } from "./outbox-store";

export interface MessagingDeliveryBindings {
  HYPERDRIVE: HyperdriveBinding;
  USER_REALTIME: DurableObjectNamespace;
  /** JSON service account stored only in a Worker secret. */
  FCM_SERVICE_ACCOUNT_JSON?: string;
  /** Base64 256-bit AES key stored only as a Worker secret. */
  PUSH_TOKEN_ENCRYPTION_KEY?: string;
}

/** Builds independent realtime and push handlers. Missing FCM config never blocks realtime jobs. */
export function createMessagingDeliveryDispatcher(env: MessagingDeliveryBindings) {
  const realtime = createDurableObjectRealtimePublisher(env.USER_REALTIME, env.HYPERDRIVE);
  // One dispatcher owns one FCM sender, preserving its short-lived OAuth cache
  // across the bounded batch rather than minting a JWT for every device.
  const pushHandler = configuredPushHandlerOnce(env);
  const push = async (job: import("./outbox-store").OutboxJob, options: { signal: AbortSignal }) => (await pushHandler)(job, options);
  return createOutboxDispatcher({
    store: createHyperdriveOutboxStore(env.HYPERDRIVE),
    handlers: { realtime: realtime.deliver, push },
  });
}

async function configuredPushHandlerOnce(env: MessagingDeliveryBindings) {
  const protector = await createWorkerPushTokenProtector(env.PUSH_TOKEN_ENCRYPTION_KEY);
  if (!protector || !env.FCM_SERVICE_ACCOUNT_JSON) return async () => ({ ok: true as const });
  return configuredPushHandler(env, protector);
}

function configuredPushHandler(env: MessagingDeliveryBindings, protector: NonNullable<Awaited<ReturnType<typeof createWorkerPushTokenProtector>>>) {
  let account;
  try { account = normalizeFcmServiceAccount(JSON.parse(env.FCM_SERVICE_ACCOUNT_JSON!)); }
  catch { return async () => ({ ok: false as const, retryable: true, category: "unauthorized" as const }); }
  if (!account) return async () => ({ ok: false as const, retryable: true, category: "unauthorized" as const });
  return createPushOutboxHandler({
    destinations: createHyperdrivePushDestinationResolver(env.HYPERDRIVE, protector),
    sender: createFcmHttpV1Sender({ serviceAccount: account }),
  });
}
