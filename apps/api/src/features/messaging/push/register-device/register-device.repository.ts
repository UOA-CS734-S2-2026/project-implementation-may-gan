import { schema, sql, type DayliDatabase } from "@dayli/db";
import { and, eq, gt, ne } from "drizzle-orm";
import { PushSessionInactiveError, type RegisterPushDeviceStore } from "./register-device.service";

/** Token ownership rotates transactionally, so a device reused after account switch has one owner. */
export function createPostgresRegisterDeviceStore(database: DayliDatabase): RegisterPushDeviceStore {
  return {
    async register(device) {
      await database.transaction(async (tx) => {
        // The route actor can become stale while token encryption is in flight.
        // Reauthorize in this transaction before a stale request can rotate a
        // device token away from its current account owner.
        const [current] = await tx
          .select({ id: schema.session.id })
          .from(schema.session)
          .innerJoin(schema.user, eq(schema.user.id, schema.session.userId))
          .where(and(
            eq(schema.session.id, device.sessionId),
            eq(schema.session.userId, device.userId),
            gt(schema.session.expiresAt, sql`now()`),
            sql`(coalesce(${schema.user.banned}, false) = false or (${schema.user.banExpires} is not null and ${schema.user.banExpires} <= now()))`,
          ))
          .for("key share", { of: [schema.session, schema.user] })
          .limit(1);
        if (!current) throw new PushSessionInactiveError();
        await tx
          .delete(schema.pushDevices)
          .where(and(
            eq(schema.pushDevices.tokenHash, device.tokenHash),
            ne(schema.pushDevices.userId, device.userId),
          ));
        await tx
          .insert(schema.pushDevices)
          .values({
            id: device.id,
            userId: device.userId,
            sessionId: device.sessionId,
            installationId: device.installationId,
            platform: device.platform,
            token: device.tokenCiphertext,
            tokenCiphertext: device.tokenCiphertext,
            tokenKeyVersion: device.tokenKeyVersion,
            tokenHash: device.tokenHash,
            optedIn: device.optedIn,
            notificationSchemaVersion: device.notificationSchemaVersion ?? null,
            registeredAt: device.now,
            invalidatedAt: null,
          })
          .onConflictDoUpdate({
            target: [schema.pushDevices.userId, schema.pushDevices.installationId],
            set: {
              sessionId: sql`excluded.session_id`,
              platform: sql`excluded.platform`,
              token: sql`excluded.token`,
              tokenCiphertext: sql`excluded.token_ciphertext`,
              tokenKeyVersion: sql`excluded.token_key_version`,
              tokenHash: sql`excluded.token_hash`,
              optedIn: sql`excluded.opted_in`,
              notificationSchemaVersion: sql`excluded.notification_schema_version`,
              registeredAt: sql`excluded.registered_at`,
              invalidatedAt: null,
            },
          });
      });
    },
  };
}
