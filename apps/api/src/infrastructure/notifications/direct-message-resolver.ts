import { createHyperdriveDatabase, schema, sql, type DayliDatabase, type HyperdriveBinding } from "@dayli/db";
import { and, eq, gt, isNotNull, isNull, lte, notExists, or } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { allowsAccountCapability } from "../../features/account-policy/shared/account-policy";
import { conversationParticipantsAvailable } from "../../features/messaging/shared/conversation-participants";
import { readAccountPolicy } from "../../features/account-policy/shared/account-policy.repository";
import type { PushTokenProtector } from "../push/token-encryption";
import type { GenericFcmNotificationInput } from "../push/fcm";
import type { NotificationJob } from "./notification-store";

export interface ResolvedDirectMessageNotification {
  token: string;
  eventId: string;
  targetId: string;
  title: string;
  body: string;
  type?: GenericFcmNotificationInput["type"];
  targetType?: GenericFcmNotificationInput["targetType"];
  /** Internal compare-and-set identity. Never include it in provider payloads or logs. */
  registrationGeneration: { sessionId: string; tokenHash: string };
}

export interface DirectMessageNotificationResolver {
  resolve(job: NotificationJob, options?: { signal?: AbortSignal }): Promise<ResolvedDirectMessageNotification | null>;
  invalidate(
    job: Pick<NotificationJob, "deviceRegistrationId" | "recipientId">,
    generation: ResolvedDirectMessageNotification["registrationGeneration"],
  ): Promise<void>;
}

/** Reads current preview and every recipient authorization fence immediately before send. */
export function createPostgresDirectMessageNotificationResolver(
  database: DayliDatabase,
  protector: PushTokenProtector,
): DirectMessageNotificationResolver {
  const recipientParticipant = alias(schema.messagingParticipants, "notification_recipient_participant");
  const senderParticipant = alias(schema.messagingParticipants, "notification_sender_participant");
  const sender = alias(schema.user, "notification_sender");
  return {
    async resolve(job, options) {
      if (options?.signal?.aborted) return null;
      const participantsAvailable = conversationParticipantsAvailable(
        schema.conversations.participantLowId,
        schema.conversations.participantHighId,
      );
      const unblocked = notExists(database.select({ value: sql`1` })
        .from(schema.relationshipBlocks)
        .where(and(
          isNull(schema.relationshipBlocks.unblockedAt),
          or(
            and(
              eq(schema.relationshipBlocks.blockerId, job.recipientId),
              eq(schema.relationshipBlocks.blockedId, sender.id),
            ),
            and(
              eq(schema.relationshipBlocks.blockerId, sender.id),
              eq(schema.relationshipBlocks.blockedId, job.recipientId),
            ),
          ),
        )));
      const [row] = await database.select({
        tokenCiphertext: schema.pushDevices.tokenCiphertext,
        tokenKeyVersion: schema.pushDevices.tokenKeyVersion,
        tokenHash: schema.pushDevices.tokenHash,
        sessionId: schema.pushDevices.sessionId,
        eventId: schema.notificationEvents.id,
        targetId: schema.notificationEvents.targetId,
        title: sender.name,
        body: schema.messages.body,
        participantsAvailable,
      })
        .from(schema.notificationDeliveries)
        .innerJoin(schema.notificationEvents, and(
          eq(schema.notificationEvents.id, schema.notificationDeliveries.eventId),
          eq(schema.notificationEvents.recipientId, schema.notificationDeliveries.recipientId),
          eq(schema.notificationEvents.kind, "direct_message"),
          eq(schema.notificationEvents.sourceType, "message"),
          eq(schema.notificationEvents.targetType, "conversation"),
          gt(schema.notificationEvents.expiresAt, sql`now()`),
        ))
        .innerJoin(schema.pushDevices, and(
          eq(schema.pushDevices.id, schema.notificationDeliveries.deviceRegistrationId),
          eq(schema.pushDevices.userId, schema.notificationDeliveries.recipientId),
          eq(schema.pushDevices.optedIn, true),
          eq(schema.pushDevices.notificationSchemaVersion, 1),
          isNull(schema.pushDevices.invalidatedAt),
          isNotNull(schema.pushDevices.tokenCiphertext),
          isNotNull(schema.pushDevices.tokenKeyVersion),
        ))
        .innerJoin(schema.session, and(
          eq(schema.session.id, schema.pushDevices.sessionId),
          eq(schema.session.userId, schema.pushDevices.userId),
          gt(schema.session.expiresAt, sql`now()`),
        ))
        .innerJoin(schema.user, and(
          eq(schema.user.id, schema.notificationDeliveries.recipientId),
          or(
            eq(schema.user.banned, false),
            isNull(schema.user.banned),
            and(isNotNull(schema.user.banExpires), lte(schema.user.banExpires, sql`now()`)),
          ),
        ))
        .leftJoin(schema.accountLifecycles, eq(schema.accountLifecycles.userId, schema.notificationDeliveries.recipientId))
        .innerJoin(schema.accountNotificationPreferences, and(
          eq(schema.accountNotificationPreferences.userId, schema.notificationDeliveries.recipientId),
          eq(schema.accountNotificationPreferences.enabled, true),
        ))
        .innerJoin(schema.messages, and(
          eq(schema.messages.id, schema.notificationEvents.sourceId),
          eq(schema.messages.conversationId, schema.notificationEvents.targetId),
          isNull(schema.messages.unsentAt),
          isNotNull(schema.messages.body),
        ))
        .innerJoin(schema.conversations, eq(schema.conversations.id, schema.messages.conversationId))
        .innerJoin(senderParticipant, and(
          eq(senderParticipant.id, schema.messages.senderParticipantId),
          eq(senderParticipant.state, "active"),
        ))
        .innerJoin(sender, eq(sender.id, senderParticipant.userId))
        .innerJoin(schema.conversationMembers, eq(
          schema.conversationMembers.conversationId,
          schema.messages.conversationId,
        ))
        .innerJoin(recipientParticipant, and(
          eq(recipientParticipant.id, schema.conversationMembers.participantId),
          eq(recipientParticipant.userId, schema.notificationDeliveries.recipientId),
          eq(recipientParticipant.state, "active"),
        ))
        .where(and(
          eq(schema.notificationDeliveries.id, job.id),
          eq(schema.notificationDeliveries.eventId, job.eventId),
          eq(schema.notificationDeliveries.recipientId, job.recipientId),
          eq(schema.notificationDeliveries.deviceRegistrationId, job.deviceRegistrationId),
          or(isNull(schema.accountLifecycles.state), eq(schema.accountLifecycles.state, "active")),
          unblocked,
        ))
        .limit(1);
      if (!row || !row.participantsAvailable || !row.body || !row.title || !row.tokenCiphertext || !row.tokenKeyVersion) return null;
      if (options?.signal?.aborted) return null;
      try {
        if (!allowsAccountCapability(await readAccountPolicy(database, job.recipientId), "ordinary")) return null;
      } catch {
        return null;
      }
      if (options?.signal?.aborted) return null;
      const token = await protector.decrypt({ ciphertext: row.tokenCiphertext, keyVersion: row.tokenKeyVersion });
      if (options?.signal?.aborted) return null;
      return token ? {
        token,
        eventId: row.eventId,
        targetId: row.targetId,
        title: row.title,
        body: row.body,
        registrationGeneration: { sessionId: row.sessionId, tokenHash: row.tokenHash },
      } : null;
    },
    async invalidate(job, generation) {
      await database.update(schema.pushDevices)
        .set({ invalidatedAt: sql`now()`, optedIn: false })
        .where(and(
          eq(schema.pushDevices.id, job.deviceRegistrationId),
          eq(schema.pushDevices.userId, job.recipientId),
          eq(schema.pushDevices.sessionId, generation.sessionId),
          eq(schema.pushDevices.tokenHash, generation.tokenHash),
          isNull(schema.pushDevices.invalidatedAt),
        ));
    },
  };
}

export function createHyperdriveDirectMessageNotificationResolver(
  hyperdrive: HyperdriveBinding,
  protector: PushTokenProtector,
): DirectMessageNotificationResolver {
  const run = async <T>(operation: (resolver: DirectMessageNotificationResolver) => Promise<T>): Promise<T> => {
    const client = createHyperdriveDatabase(hyperdrive);
    try { return await operation(createPostgresDirectMessageNotificationResolver(client.db, protector)); }
    finally { await client.close(); }
  };
  return {
    resolve: (job, options) => run((resolver) => resolver.resolve(job, options)),
    invalidate: (job, generation) => run((resolver) => resolver.invalidate(job, generation)),
  };
}
