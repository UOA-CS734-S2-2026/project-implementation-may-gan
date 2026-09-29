import { sql, type DayliDatabase } from "@dayli/db";
import { PushSessionInactiveError, type RegisterPushDeviceStore } from "./register-device.service";

/** Token ownership rotates transactionally, so a device reused after account switch has one owner. */
export function createPostgresRegisterDeviceStore(database: DayliDatabase): RegisterPushDeviceStore {
  return {
    async register(device) {
      await database.transaction(async (tx) => {
        // The route actor can become stale while token encryption is in flight.
        // Reauthorize in this transaction before a stale request can rotate a
        // device token away from its current account owner.
        const current = await tx.execute(sql`
          select s.id
          from public.session s
          join public."user" u on u.id = s.user_id
          where s.id = ${device.sessionId} and s.user_id = ${device.userId}
            and s.expires_at > now()
            and (coalesce(u.banned, false) = false or (u.ban_expires is not null and u.ban_expires <= now()))
          for key share of s, u
          limit 1
        `);
        if (![...current as Iterable<unknown>][0]) throw new PushSessionInactiveError();
        await tx.execute(sql`delete from public.push_devices where token_hash = ${device.tokenHash} and user_id <> ${device.userId}`);
        await tx.execute(sql`
          insert into public.push_devices (id, user_id, session_id, installation_id, platform, token, token_ciphertext, token_key_version, token_hash, opted_in, registered_at, invalidated_at)
          values (${device.id}, ${device.userId}, ${device.sessionId}, ${device.installationId}, ${device.platform}, ${device.tokenCiphertext}, ${device.tokenCiphertext}, ${device.tokenKeyVersion}, ${device.tokenHash}, ${device.optedIn}, ${device.now.toISOString()}::timestamptz, null)
          on conflict (user_id, installation_id) do update set
            session_id = excluded.session_id, platform = excluded.platform, token = excluded.token,
            token_ciphertext = excluded.token_ciphertext, token_key_version = excluded.token_key_version,
            token_hash = excluded.token_hash, opted_in = excluded.opted_in,
            registered_at = excluded.registered_at, invalidated_at = null
        `);
      });
    },
  };
}
