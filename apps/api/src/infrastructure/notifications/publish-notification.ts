import { schema, sql, type DayliDatabase } from "@dayli/db";
import { and, eq, gt, isNotNull, isNull } from "drizzle-orm";

export type PublishedNotificationKind = "friend_request" | "final_hour_reminder" | "friends_post_release";
type Queryable = Pick<DayliDatabase, "insert" | "select">;

const targets = {
  friend_request: "friend_request",
  final_hour_reminder: "posting_day",
  friends_post_release: "friends_feed",
} as const;

/** Internal source transaction capability. Copy and provider I/O are never stored here. */
export async function publishNotificationIntent(database: Queryable, source: {
  kind: PublishedNotificationKind;
  recipientId: string;
  sourceId: string;
  createdAt: Date;
  expiresAt: Date;
}): Promise<boolean> {
  const [inserted] = await database.insert(schema.notificationEvents).values({
    id: crypto.randomUUID(), kind: source.kind, recipientId: source.recipientId,
    deduplicationKey: source.sourceId, sourceType: source.kind, sourceId: source.sourceId,
    targetType: targets[source.kind], targetId: source.sourceId,
    createdAt: source.createdAt, expiresAt: source.expiresAt,
  }).onConflictDoNothing({ target: [schema.notificationEvents.kind, schema.notificationEvents.recipientId, schema.notificationEvents.deduplicationKey] })
    .returning({ id: schema.notificationEvents.id });
  // A repeated source must not create work for devices registered after the source event.
  if (!inserted) return false;
  const devices = await database.select({ id: schema.pushDevices.id }).from(schema.pushDevices)
    .innerJoin(schema.accountNotificationPreferences, and(
      eq(schema.accountNotificationPreferences.userId, schema.pushDevices.userId),
      eq(schema.accountNotificationPreferences.enabled, true),
    ))
    .innerJoin(schema.session, and(
      eq(schema.session.id, schema.pushDevices.sessionId),
      eq(schema.session.userId, schema.pushDevices.userId),
      gt(schema.session.expiresAt, sql`now()`),
    ))
    .where(and(
      eq(schema.pushDevices.userId, source.recipientId), eq(schema.pushDevices.optedIn, true),
      eq(schema.pushDevices.notificationSchemaVersion, 1), isNull(schema.pushDevices.invalidatedAt),
      isNotNull(schema.pushDevices.tokenCiphertext), isNotNull(schema.pushDevices.tokenKeyVersion),
    ));
  if (!devices.length) return true;
  await database.insert(schema.notificationDeliveries).values(devices.map((device) => ({
    id: crypto.randomUUID(), eventId: inserted.id, recipientId: source.recipientId,
    deviceRegistrationId: device.id, status: "pending" as const, attempts: 0,
    availableAt: source.createdAt, createdAt: source.createdAt,
  }))).onConflictDoNothing({ target: [schema.notificationDeliveries.eventId, schema.notificationDeliveries.deviceRegistrationId] });
  return true;
}

export function publishFriendRequestNotification(database: Queryable, source: { requestId: string; recipientId: string; createdAt: Date }) {
  return publishNotificationIntent(database, {
    kind: "friend_request", sourceId: source.requestId, recipientId: source.recipientId,
    createdAt: source.createdAt, expiresAt: new Date(source.createdAt.getTime() + 7 * 86_400_000),
  });
}
