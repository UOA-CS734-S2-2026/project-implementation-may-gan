import type { DeliveryResult } from "../jobs/dispatch-outbox";
import type { OutboxJob } from "../jobs/outbox-store";

export interface PushDestination {
  token: string;
  /** Current registration policy has already checked owner, active session, opt-in and block state. */
  valid: boolean;
  /** Internal compare-and-set identity. Never include it in provider payloads or logs. */
  registrationGeneration: { sessionId: string; tokenHash: string };
}

export interface PushDestinationResolver {
  resolve(job: OutboxJob): Promise<PushDestination | null>;
  invalidate(
    job: Pick<OutboxJob, "deviceRegistrationId" | "recipientId">,
    generation: PushDestination["registrationGeneration"],
  ): Promise<void>;
}

export interface GenericPushSender {
  send(input: { token: string; eventId: string; conversationId: string }, options?: { signal: AbortSignal }): Promise<DeliveryResult>;
}

/** Resolves a current device at dispatch time, so stale registrations cannot leak alerts. */
export function createPushOutboxHandler(input: { destinations: PushDestinationResolver; sender: GenericPushSender }) {
  return async (job: OutboxJob, options?: { signal: AbortSignal }): Promise<DeliveryResult> => {
    if (job.channel !== "push" || !job.deviceRegistrationId) return { ok: false, retryable: false, category: "provider_rejected" };
    const destination = await input.destinations.resolve(job);
    // Suppression is a successful no-op, not a retry that keeps obsolete alerts alive.
    if (!destination || !destination.valid) return { ok: true };
    if (options?.signal.aborted) return { ok: false, retryable: true, category: "transient" };
    const result = await input.sender.send({ token: destination.token, eventId: job.eventId, conversationId: job.conversationId }, options);
    if (!result.ok && !result.retryable && result.category === "provider_rejected") {
      await input.destinations.invalidate(job, destination.registrationGeneration);
    }
    return result;
  };
}
