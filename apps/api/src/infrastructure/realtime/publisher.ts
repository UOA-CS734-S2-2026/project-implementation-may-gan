import type { ConversationChangedEvent } from "@dayli/contracts";
import type { OutboxJob } from "../jobs/outbox-store";
import { bodyFreeRealtimeEvent } from "../jobs/dispatch-outbox";

interface UserRealtimeRpc {
  publish(event: ConversationChangedEvent): Promise<void>;
  revokeSession(sessionId: string): Promise<void>;
}

/** Internal adapter used only after an outbox lease has been committed. */
export function createDurableObjectRealtimePublisher(namespace: DurableObjectNamespace) {
  const stubFor = (userId: string) => namespace.get(namespace.idFromName(userId)) as unknown as UserRealtimeRpc;
  return {
    async deliver(job: OutboxJob) {
      if (job.channel !== "realtime") return { ok: false as const, retryable: false, category: "provider_rejected" as const };
      await stubFor(job.recipientId).publish(bodyFreeRealtimeEvent(job));
      return { ok: true as const };
    },
    revokeSession(userId: string, sessionId: string) {
      return stubFor(userId).revokeSession(sessionId);
    },
  };
}
