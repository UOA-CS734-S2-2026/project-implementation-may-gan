import { schema, sql, type DayliDatabase } from "@dayli/db";
import { and, eq, gt, isNotNull, isNull, or, type SQL } from "drizzle-orm";

type Queryable = Pick<DayliDatabase, "insert" | "select">;

export interface DirectMessageNotificationSource {
  messageId: string;
  conversationId: string;
  recipientId: string;
  createdAt: Date | SQL;
}

/**
 * Records the approved direct-message event and capable-device work inside the
 * source transaction. It stores identities only. Preview copy is read later.
 */
export async function publishDirectMessageNotification(
  queryable: Queryable,
  source: DirectMessageNotificationSource,
): Promise<void> {
  const eventId = crypto.randomUUID();
  const expiresAt = source.createdAt instanceof Date
    ? new Date(source.createdAt.getTime() + 7 * 24 * 60 * 60 * 1_000)
    : sql`${source.createdAt} + interval '7 days'`;
  const [inserted] = await queryable
    .insert(schema.notificationEvents)
    .values({
      id: eventId,
      kind: "direct_message",
      recipientId: source.recipientId,
      deduplicationKey: source.messageId,
      sourceType: "message",
      sourceId: source.messageId,
      targetType: "conversation",
      targetId: source.conversationId,
      expiresAt,
      createdAt: source.createdAt,
    })
    .onConflictDoNothing({
      target: [
        schema.notificationEvents.kind,
        schema.notificationEvents.recipientId,
        schema.notificationEvents.deduplicationKey,
      ],
    })
    .returning({ id: schema.notificationEvents.id });

  let logicalEventId = inserted?.id;
  if (!logicalEventId) {
    const [existing] = await queryable
      .select({ id: schema.notificationEvents.id })
      .from(schema.notificationEvents)
      .where(and(
        eq(schema.notificationEvents.kind, "direct_message"),
        eq(schema.notificationEvents.recipientId, source.recipientId),
        eq(schema.notificationEvents.deduplicationKey, source.messageId),
      ))
      .limit(1);
    logicalEventId = existing?.id;
  }
  if (!logicalEventId) throw new Error("Notification event could not be recorded.");

  const devices = await queryable
    .select({ id: schema.pushDevices.id })
    .from(schema.pushDevices)
    .innerJoin(schema.accountNotificationPreferences, and(
      eq(schema.accountNotificationPreferences.userId, schema.pushDevices.userId),
      eq(schema.accountNotificationPreferences.enabled, true),
    ))
    .innerJoin(schema.session, and(
      eq(schema.session.id, schema.pushDevices.sessionId),
      eq(schema.session.userId, schema.pushDevices.userId),
      gt(schema.session.expiresAt, sql`now()`),
    ))
    .leftJoin(schema.accountLifecycles, eq(schema.accountLifecycles.userId, schema.pushDevices.userId))
    .where(and(
      eq(schema.pushDevices.userId, source.recipientId),
      eq(schema.pushDevices.optedIn, true),
      eq(schema.pushDevices.notificationSchemaVersion, 1),
      isNull(schema.pushDevices.invalidatedAt),
      isNotNull(schema.pushDevices.tokenCiphertext),
      isNotNull(schema.pushDevices.tokenKeyVersion),
      or(isNull(schema.accountLifecycles.state), eq(schema.accountLifecycles.state, "active")),
    ));

  if (devices.length === 0) return;
  await queryable
    .insert(schema.notificationDeliveries)
    .values(devices.map((device) => ({
      id: crypto.randomUUID(),
      eventId: logicalEventId!,
      recipientId: source.recipientId,
      deviceRegistrationId: device.id,
      status: "pending" as const,
      attempts: 0,
      availableAt: source.createdAt,
      createdAt: source.createdAt,
    })))
    .onConflictDoNothing({
      target: [schema.notificationDeliveries.eventId, schema.notificationDeliveries.deviceRegistrationId],
    });
}
