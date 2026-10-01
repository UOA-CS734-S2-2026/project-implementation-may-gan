import { createHyperdriveDatabase, schema, sql, type DayliDatabase, type HyperdriveBinding } from "@dayli/db";
import { and, eq, gt, isNotNull, isNull, lte, not, or } from "drizzle-orm";
import type { OutboxJob } from "../jobs/outbox-store";
import type { PushDestinationResolver } from "./push-dispatcher";
import type { PushTokenProtector } from "./token-encryption";
import { conversationPairBlocked, conversationParticipantsAvailable } from "../../features/messaging/shared/conversation-participants";

/** Rechecks registration, current session, membership and blocks immediately before FCM. */
export function createPostgresPushDestinationResolver(database: DayliDatabase, protector: PushTokenProtector): PushDestinationResolver {
  return {
    async resolve(job: OutboxJob) {
      if (!job.deviceRegistrationId) return null;
      const participantsAvailable = conversationParticipantsAvailable(
        schema.conversations.participantLowId,
        schema.conversations.participantHighId,
      );
      const blocked = conversationPairBlocked(
        database,
        schema.conversations.participantLowId,
        schema.conversations.participantHighId,
      );
      const [row] = await database
        .select({
          tokenCiphertext: schema.pushDevices.tokenCiphertext,
          tokenKeyVersion: schema.pushDevices.tokenKeyVersion,
          participantsAvailable,
        })
        .from(schema.pushDevices)
        .innerJoin(schema.session, and(
          eq(schema.session.id, schema.pushDevices.sessionId),
          eq(schema.session.userId, schema.pushDevices.userId),
          gt(schema.session.expiresAt, sql`now()`),
        ))
        .innerJoin(schema.user, and(
          eq(schema.user.id, schema.pushDevices.userId),
          or(
            eq(schema.user.banned, false),
            isNull(schema.user.banned),
            and(isNotNull(schema.user.banExpires), lte(schema.user.banExpires, sql`now()`)),
          ),
        ))
        .innerJoin(schema.conversationMembers, eq(
          schema.conversationMembers.conversationId,
          job.conversationId,
        ))
        .innerJoin(schema.messagingParticipants, and(
          eq(schema.messagingParticipants.id, schema.conversationMembers.participantId),
          eq(schema.messagingParticipants.userId, schema.pushDevices.userId),
          eq(schema.messagingParticipants.state, "active"),
        ))
        .leftJoin(schema.accountLifecycles, eq(schema.accountLifecycles.userId, schema.pushDevices.userId))
        .innerJoin(schema.conversations, eq(schema.conversations.id, job.conversationId))
        .where(and(
          eq(schema.pushDevices.id, job.deviceRegistrationId),
          eq(schema.pushDevices.userId, job.recipientId),
          eq(schema.pushDevices.optedIn, true),
          or(isNull(schema.accountLifecycles.state), eq(schema.accountLifecycles.state, "active")),
          isNull(schema.pushDevices.invalidatedAt),
          not(blocked),
        ))
        .limit(1);
      if (!row || !row.participantsAvailable || typeof row.tokenCiphertext !== "string" || typeof row.tokenKeyVersion !== "string") return null;
      const token = await protector.decrypt({ ciphertext: row.tokenCiphertext, keyVersion: row.tokenKeyVersion });
      return token ? { token, valid: true } : null;
    },
    async invalidate(registrationId) {
      await database
        .update(schema.pushDevices)
        .set({ invalidatedAt: sql`now()`, optedIn: false })
        .where(eq(schema.pushDevices.id, registrationId));
    },
  };
}

export function createHyperdrivePushDestinationResolver(hyperdrive: HyperdriveBinding, protector: PushTokenProtector): PushDestinationResolver {
  return {
    async resolve(job) {
      const client = createHyperdriveDatabase(hyperdrive);
      try { return await createPostgresPushDestinationResolver(client.db, protector).resolve(job); }
      finally { await client.close(); }
    },
    async invalidate(id) {
      const client = createHyperdriveDatabase(hyperdrive);
      try { await createPostgresPushDestinationResolver(client.db, protector).invalidate(id); }
      finally { await client.close(); }
    },
  };
}
