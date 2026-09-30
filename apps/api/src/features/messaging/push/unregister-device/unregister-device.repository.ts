import { and, eq } from "drizzle-orm";
import { schema, type DayliDatabase } from "@dayli/db";

export interface UnregisterDeviceRepository {
  unregister(actorId: string, installationId: string): Promise<void>;
}

export function createPostgresUnregisterDeviceRepository(database: DayliDatabase): UnregisterDeviceRepository {
  return {
    async unregister(actorId, installationId) {
      await database
        .delete(schema.pushDevices)
        .where(and(
          eq(schema.pushDevices.userId, actorId),
          eq(schema.pushDevices.installationId, installationId),
        ));
    },
  };
}
