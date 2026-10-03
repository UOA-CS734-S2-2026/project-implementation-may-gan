import { schema, type DayliDatabase } from "@dayli/db";
import { eq, sql } from "drizzle-orm";

export interface NotificationPreferenceStore {
  read(userId: string): Promise<boolean>;
  write(userId: string, enabled: boolean): Promise<boolean>;
}

export function createPostgresNotificationPreferenceStore(database: DayliDatabase): NotificationPreferenceStore {
  return {
    async read(userId) {
      const [row] = await database
        .select({ enabled: schema.accountNotificationPreferences.enabled })
        .from(schema.accountNotificationPreferences)
        .where(eq(schema.accountNotificationPreferences.userId, userId))
        .limit(1);
      return row?.enabled ?? false;
    },
    async write(userId, enabled) {
      const [row] = await database
        .insert(schema.accountNotificationPreferences)
        .values({ userId, enabled })
        .onConflictDoUpdate({
          target: schema.accountNotificationPreferences.userId,
          set: { enabled, updatedAt: sql`now()` },
        })
        .returning({ enabled: schema.accountNotificationPreferences.enabled });
      return row?.enabled ?? false;
    },
  };
}
