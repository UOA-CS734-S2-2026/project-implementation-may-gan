import { createHyperdriveDatabase, schema, sql, type DayliDatabase, type HyperdriveBinding } from "@dayli/db";
import { and, eq, gt, isNotNull, isNull, lte, or } from "drizzle-orm";
import { buildDrizzleActiveAccountFilter, notBlockedWith } from "../../features/permissions/drizzle";
import { allowsAccountCapability } from "../../features/account-policy/shared/account-policy";
import { readAccountPolicy } from "../../features/account-policy/shared/account-policy.repository";
import type { PushTokenProtector } from "../push/token-encryption";
import { createPostgresDirectMessageNotificationResolver, type DirectMessageNotificationResolver } from "./direct-message-resolver";
import { dailyNotificationWindow, hasAcceptedPost, hasReleasedFriendPost } from "./daily-notification-scheduler";

/** Every category shares recipient fences but retains its source's current authorization. */
export function createPostgresNotificationResolver(database: DayliDatabase, protector: PushTokenProtector, clock: () => Date = () => new Date()): DirectMessageNotificationResolver {
  const messages = createPostgresDirectMessageNotificationResolver(database, protector);
  return {
    invalidate: messages.invalidate,
    async resolve(job, options) {
      if (options?.signal?.aborted) return null;
      const [event] = await database.select().from(schema.notificationEvents).where(and(
        eq(schema.notificationEvents.id, job.eventId), eq(schema.notificationEvents.recipientId, job.recipientId), gt(schema.notificationEvents.expiresAt, sql`now()`),
      )).limit(1);
      if (!event || options?.signal?.aborted) return null;
      if (event.kind === "direct_message") return messages.resolve(job, options);
      const targets = { friend_request: "friend_request", final_hour_reminder: "posting_day", friends_post_release: "friends_feed" } as const;
      if (event.sourceType !== event.kind || event.targetType !== targets[event.kind] || event.sourceId !== event.targetId) return null;
      const [device] = await database.select({
        ciphertext: schema.pushDevices.tokenCiphertext, keyVersion: schema.pushDevices.tokenKeyVersion,
        sessionId: schema.pushDevices.sessionId, tokenHash: schema.pushDevices.tokenHash,
      }).from(schema.notificationDeliveries)
        .innerJoin(schema.pushDevices, and(eq(schema.pushDevices.id, schema.notificationDeliveries.deviceRegistrationId), eq(schema.pushDevices.userId, job.recipientId)))
        .innerJoin(schema.session, and(eq(schema.session.id, schema.pushDevices.sessionId), eq(schema.session.userId, job.recipientId), gt(schema.session.expiresAt, sql`now()`)))
        .innerJoin(schema.user, eq(schema.user.id, job.recipientId))
        .innerJoin(schema.accountNotificationPreferences, and(eq(schema.accountNotificationPreferences.userId, job.recipientId), eq(schema.accountNotificationPreferences.enabled, true)))
        .where(and(
          eq(schema.notificationDeliveries.id, job.id), eq(schema.notificationDeliveries.eventId, job.eventId),
          eq(schema.notificationDeliveries.recipientId, job.recipientId), eq(schema.notificationDeliveries.deviceRegistrationId, job.deviceRegistrationId),
          eq(schema.pushDevices.optedIn, true), eq(schema.pushDevices.notificationSchemaVersion, 1), isNull(schema.pushDevices.invalidatedAt),
          isNotNull(schema.pushDevices.tokenCiphertext), isNotNull(schema.pushDevices.tokenKeyVersion),
          buildDrizzleActiveAccountFilter(database, schema.user.id),
        )).limit(1);
      if (!device?.ciphertext || !device.keyVersion || options?.signal?.aborted) return null;
      // Database failures propagate to bounded retry, not permanent suppression.
      if (!allowsAccountCapability(await readAccountPolicy(database, job.recipientId), "ordinary")) return null;
      let title = "Dayli";
      let body: string;
      if (event.kind === "friend_request") {
        const [request] = await database.select({ name: sql<string>`coalesce(${schema.user.displayUsername}, ${schema.user.username})` })
          .from(schema.friendRequests).innerJoin(schema.user, eq(schema.user.id, schema.friendRequests.senderId))
          .where(and(eq(schema.friendRequests.id, event.sourceId), eq(schema.friendRequests.recipientId, job.recipientId), eq(schema.friendRequests.status, "pending"),
            isNotNull(schema.user.username), buildDrizzleActiveAccountFilter(database, schema.user.id),
            or(eq(schema.user.banned, false), isNull(schema.user.banned), lte(schema.user.banExpires, sql`now()`)),
            notBlockedWith(database, job.recipientId, schema.user.id),
          )).limit(1);
        if (!request?.name) return null;
        title = request.name;
        body = "Sent you a friend request on Dayli";
      } else {
        const now = clock();
        const window = dailyNotificationWindow(now);
        if (event.sourceId !== window.localDate || event.expiresAt.getTime() !== window.nextMidnightUtc.getTime()) return null;
        if (event.kind === "final_hour_reminder") {
          if (!window.reminderOpen) return null;
          const [posted] = await database.select({ accepted: hasAcceptedPost(database, job.recipientId, window.localDate) }).from(schema.user).where(eq(schema.user.id, job.recipientId));
          if (!posted || posted.accepted) return null;
          body = "There is still time to post today.";
        } else {
          const [feed] = await database.select({ readable: hasReleasedFriendPost(database, job.recipientId, window.previousDate, now) }).from(schema.user).where(eq(schema.user.id, job.recipientId));
          if (!feed?.readable) return null;
          body = "Your friends' posts are ready.";
        }
      }
      if (options?.signal?.aborted) return null;
      const token = await protector.decrypt({ ciphertext: device.ciphertext, keyVersion: device.keyVersion });
      if (!token || options?.signal?.aborted) return null;
      return { token, eventId: event.id, targetId: event.targetId, title, body, type: event.kind, targetType: targets[event.kind], registrationGeneration: { sessionId: device.sessionId, tokenHash: device.tokenHash } };
    },
  };
}

export function createHyperdriveNotificationResolver(hyperdrive: HyperdriveBinding, protector: PushTokenProtector): DirectMessageNotificationResolver {
  const run = async <T>(operation: (resolver: DirectMessageNotificationResolver) => Promise<T>): Promise<T> => {
    const client = createHyperdriveDatabase(hyperdrive);
    try { return await operation(createPostgresNotificationResolver(client.db, protector)); }
    finally { await client.close(); }
  };
  return { resolve: (job, options) => run((resolver) => resolver.resolve(job, options)), invalidate: (job, generation) => run((resolver) => resolver.invalidate(job, generation)) };
}
