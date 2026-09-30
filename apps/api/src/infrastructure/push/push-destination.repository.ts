import { createHyperdriveDatabase, schema, sql, type DayliDatabase, type HyperdriveBinding } from "@dayli/db";
import { and, eq, gt, isNull } from "drizzle-orm";
import type { OutboxJob } from "../jobs/outbox-store";
import type { PushDestinationResolver } from "./push-dispatcher";
import type { PushTokenProtector } from "./token-encryption";

/** Rechecks registration, current session, membership and blocks immediately before FCM. */
export function createPostgresPushDestinationResolver(database: DayliDatabase, protector: PushTokenProtector): PushDestinationResolver {
  return {
    async resolve(job: OutboxJob) {
      if (!job.deviceRegistrationId) return null;
      const [row] = await database
        .select({
          tokenCiphertext: schema.pushDevices.tokenCiphertext,
          tokenKeyVersion: schema.pushDevices.tokenKeyVersion,
        })
        .from(schema.pushDevices)
        .innerJoin(schema.session, and(
          eq(schema.session.id, schema.pushDevices.sessionId),
          eq(schema.session.userId, schema.pushDevices.userId),
          gt(schema.session.expiresAt, sql`now()`),
        ))
        .innerJoin(schema.user, and(
          eq(schema.user.id, schema.pushDevices.userId),
          sql`(coalesce(${schema.user.banned}, false) = false or (${schema.user.banExpires} is not null and ${schema.user.banExpires} <= now()))`,
        ))
        .innerJoin(schema.conversationMembers, and(
          eq(schema.conversationMembers.conversationId, job.conversationId),
          eq(schema.conversationMembers.participantId, schema.pushDevices.userId),
        ))
        .innerJoin(schema.conversations, eq(schema.conversations.id, job.conversationId))
        .where(and(
          eq(schema.pushDevices.id, job.deviceRegistrationId),
          eq(schema.pushDevices.userId, job.recipientId),
          eq(schema.pushDevices.optedIn, true),
          isNull(schema.pushDevices.invalidatedAt),
          sql`not exists (
            select 1 from ${schema.relationshipBlocks}
            where ${schema.relationshipBlocks.unblockedAt} is null
              and (
                (${schema.relationshipBlocks.blockerId} = ${schema.conversations.participantLowId}
                  and ${schema.relationshipBlocks.blockedId} = ${schema.conversations.participantHighId})
                or (${schema.relationshipBlocks.blockerId} = ${schema.conversations.participantHighId}
                  and ${schema.relationshipBlocks.blockedId} = ${schema.conversations.participantLowId})
              )
          )`,
        ))
        .limit(1);
      if (!row || typeof row.tokenCiphertext !== "string" || typeof row.tokenKeyVersion !== "string") return null;
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
