import { age16DeclarationVersion } from "@dayli/contracts";
import { getAucklandDay } from "@dayli/domain";
import { schema, sql, type DayliDatabase } from "@dayli/db";
import { and, asc, desc, eq, exists, gt, isNotNull, isNull, lte, notExists, or, type AnyColumn } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { buildDrizzleActiveAccountFilter, buildDrizzleFriendsReleaseFilter } from "../../features/permissions/drizzle";
import { publishNotificationIntent, type PublishedNotificationKind } from "./publish-notification";

export function dailyNotificationWindow(now: Date) {
  const day = getAucklandDay(() => now);
  const previousDate = getAucklandDay(() => new Date(day.startUtc.getTime() - 1)).localDate;
  return { ...day, previousDate, reminderOpen: now.getTime() >= day.nextMidnightUtc.getTime() - 3_600_000 };
}

export function hasAcceptedPost(database: Pick<DayliDatabase, "select">, recipientId: string | AnyColumn, date: string) {
  // Accepted solo and trashed posts still count as having posted.
  return exists(database.select({ id: schema.posts.id }).from(schema.posts).where(and(
    eq(schema.posts.authorId, recipientId), eq(schema.posts.localDate, date), isNotNull(schema.posts.acceptedAt),
  )));
}

export function hasReleasedFriendPost(database: Pick<DayliDatabase, "select">, recipientId: string | AnyColumn, date: string, now: Date) {
  return exists(database.select({ id: schema.posts.id }).from(schema.posts)
    .innerJoin(schema.user, eq(schema.user.id, schema.posts.authorId))
    .where(buildDrizzleFriendsReleaseFilter(database, recipientId, date, now)));
}

/** A finite recipient batch uses committed recipient/day events as its durable progress ledger. */
export async function publishDailyNotifications(database: DayliDatabase, options: { now: Date; batchSize?: number }) {
  const window = dailyNotificationWindow(options.now);
  const size = Math.max(1, Math.min(100, Math.floor(options.batchSize ?? 50)));
  const candidate = alias(schema.user, "daily_notification_candidate");
  const latestTerms = database.select({ id: schema.legalDocumentVersions.id }).from(schema.legalDocumentVersions)
    .where(and(eq(schema.legalDocumentVersions.kind, "terms"), eq(schema.legalDocumentVersions.status, "effective"), lte(schema.legalDocumentVersions.effectiveAt, sql`now()`)))
    .orderBy(desc(schema.legalDocumentVersions.effectiveAt), desc(schema.legalDocumentVersions.version)).limit(1);
  const ordinary = and(
    buildDrizzleActiveAccountFilter(database, candidate.id),
    or(eq(candidate.banned, false), isNull(candidate.banned), lte(candidate.banExpires, sql`now()`)),
    or(sql`(${latestTerms}) is null`, and(
      exists(database.select({ id: schema.termsAcceptances.userId }).from(schema.termsAcceptances).where(and(eq(schema.termsAcceptances.userId, candidate.id), eq(schema.termsAcceptances.termsVersionId, sql`(${latestTerms})`)))),
      exists(database.select({ id: schema.ageDeclarations.userId }).from(schema.ageDeclarations).where(and(eq(schema.ageDeclarations.userId, candidate.id), eq(schema.ageDeclarations.declarationVersion, age16DeclarationVersion)))),
    )),
  );
  const capableDevice = exists(database.select({ id: schema.pushDevices.id }).from(schema.pushDevices)
    .innerJoin(schema.session, and(eq(schema.session.id, schema.pushDevices.sessionId), eq(schema.session.userId, schema.pushDevices.userId), gt(schema.session.expiresAt, sql`now()`)))
    .where(and(eq(schema.pushDevices.userId, candidate.id), eq(schema.pushDevices.optedIn, true), eq(schema.pushDevices.notificationSchemaVersion, 1), isNull(schema.pushDevices.invalidatedAt), isNotNull(schema.pushDevices.tokenCiphertext), isNotNull(schema.pushDevices.tokenKeyVersion))));
  let published = 0;
  const kinds: PublishedNotificationKind[] = window.reminderOpen ? ["final_hour_reminder", "friends_post_release"] : ["friends_post_release"];
  for (const kind of kinds) {
    await database.transaction(async (transaction) => {
      const eligibility = kind === "final_hour_reminder"
        ? notExists(transaction.select({ id: schema.posts.id }).from(schema.posts).where(and(eq(schema.posts.authorId, candidate.id), eq(schema.posts.localDate, window.localDate), isNotNull(schema.posts.acceptedAt))))
        : hasReleasedFriendPost(transaction, candidate.id, window.previousDate, options.now);
      const recipients = await transaction.select({ id: candidate.id }).from(candidate)
        .innerJoin(schema.accountNotificationPreferences, and(eq(schema.accountNotificationPreferences.userId, candidate.id), eq(schema.accountNotificationPreferences.enabled, true)))
        .where(and(ordinary, capableDevice, eligibility, notExists(transaction.select({ id: schema.notificationEvents.id }).from(schema.notificationEvents).where(and(
          eq(schema.notificationEvents.kind, kind), eq(schema.notificationEvents.recipientId, candidate.id), eq(schema.notificationEvents.deduplicationKey, window.localDate),
        )))))
        .orderBy(asc(candidate.id)).limit(size);
      for (const recipient of recipients) {
        if (await publishNotificationIntent(transaction, { kind, recipientId: recipient.id, sourceId: window.localDate, createdAt: options.now, expiresAt: window.nextMidnightUtc })) published += 1;
      }
    });
  }
  return { published };
}
