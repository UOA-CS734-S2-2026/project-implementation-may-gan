import { sql, type DayliDatabase } from "@dayli/db";
import type { PushDeviceStore } from "./push-device.service";

/** Token ownership rotates transactionally, so a device reused after account switch has one owner. */
export function createPostgresPushDeviceStore(database: DayliDatabase): PushDeviceStore {
  return {
    async register(device) {
      await database.transaction(async (tx) => {
        await tx.execute(sql`delete from public.push_devices where token_hash = ${device.tokenHash} and user_id <> ${device.userId}`);
        await tx.execute(sql`
          insert into public.push_devices (id, user_id, session_id, installation_id, platform, token, token_ciphertext, token_key_version, token_hash, opted_in, registered_at, invalidated_at)
          values (${device.id}, ${device.userId}, ${device.sessionId}, ${device.installationId}, ${device.platform}, ${device.tokenCiphertext}, ${device.tokenCiphertext}, ${device.tokenKeyVersion}, ${device.tokenHash}, ${device.optedIn}, ${device.now}::timestamptz, null)
          on conflict (user_id, installation_id) do update set
            session_id = excluded.session_id, platform = excluded.platform, token = excluded.token,
            token_ciphertext = excluded.token_ciphertext, token_key_version = excluded.token_key_version,
            token_hash = excluded.token_hash, opted_in = excluded.opted_in,
            registered_at = excluded.registered_at, invalidated_at = null
        `);
      });
    },
    async unregister(userId, installationId) {
      await database.execute(sql`delete from public.push_devices where user_id = ${userId} and installation_id = ${installationId}`);
    },
  };
}
