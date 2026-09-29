import { sql, type DayliDatabase } from "@dayli/db";

export interface UnregisterDeviceRepository {
  unregister(actorId: string, installationId: string): Promise<void>;
}

export function createPostgresUnregisterDeviceRepository(database: DayliDatabase): UnregisterDeviceRepository {
  return {
    async unregister(actorId, installationId) {
      await database.execute(sql`delete from public.push_devices where user_id = ${actorId} and installation_id = ${installationId}`);
    },
  };
}
