import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  foreignKey,
  index,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";
import { pushDevices } from "./messaging";
import { user } from "./users";

/** The closed set of notification categories approved for mobile delivery. */
export const notificationKind = pgEnum("notification_kind", [
  "direct_message",
  "friend_request",
  "final_hour_reminder",
  "friends_post_release",
]);

export const notificationDeliveryStatus = pgEnum("notification_delivery_status", [
  "pending",
  "leased",
  "delivered",
  "suppressed",
  "failed",
]);

/** One owner-controlled preference applies to legacy and generic mobile notifications. */
export const accountNotificationPreferences = pgTable("account_notification_preferences", {
  userId: text("user_id").primaryKey().references(() => user.id, { onDelete: "cascade" }),
  enabled: boolean("enabled").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Durable logical events contain identities and routing references only. Banner
 * copy is resolved from current authorized source data when delivery runs.
 */
export const notificationEvents = pgTable("notification_events", {
  id: text("id").primaryKey(),
  kind: notificationKind("kind").notNull(),
  recipientId: text("recipient_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  deduplicationKey: text("deduplication_key").notNull(),
  sourceType: text("source_type").notNull(),
  sourceId: text("source_id").notNull(),
  targetType: text("target_type").notNull(),
  targetId: text("target_id").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  unique("notification_events_dedup_unique").on(table.kind, table.recipientId, table.deduplicationKey),
  unique("notification_events_id_recipient_unique").on(table.id, table.recipientId),
  index("notification_events_recipient_created_idx").on(table.recipientId, table.createdAt),
  check("notification_events_dedup_key_check", sql`char_length(${table.deduplicationKey}) between 1 and 255`),
  check("notification_events_source_type_check", sql`char_length(${table.sourceType}) between 1 and 64`),
  check("notification_events_source_id_check", sql`char_length(${table.sourceId}) between 1 and 255`),
  check("notification_events_target_type_check", sql`char_length(${table.targetType}) between 1 and 64`),
  check("notification_events_target_id_check", sql`char_length(${table.targetId}) between 1 and 255`),
  check("notification_events_expiry_check", sql`${table.expiresAt} > ${table.createdAt}`),
]);

/** Per-device work is unique, retry-bounded, and protected by paired fenced leases. */
export const notificationDeliveries = pgTable("notification_deliveries", {
  id: text("id").primaryKey(),
  eventId: text("event_id").notNull(),
  recipientId: text("recipient_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  deviceRegistrationId: text("device_registration_id").notNull(),
  status: notificationDeliveryStatus("status").notNull().default("pending"),
  attempts: bigint("attempts", { mode: "number" }).notNull().default(0),
  availableAt: timestamp("available_at", { withTimezone: true }).notNull(),
  leaseToken: text("lease_token"),
  leaseExpiresAt: timestamp("lease_expires_at", { withTimezone: true }),
  failureCategory: text("failure_category"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  deliveredAt: timestamp("delivered_at", { withTimezone: true }),
}, (table) => [
  unique("notification_deliveries_event_device_unique").on(table.eventId, table.deviceRegistrationId),
  foreignKey({
    columns: [table.eventId, table.recipientId],
    foreignColumns: [notificationEvents.id, notificationEvents.recipientId],
    name: "notification_deliveries_event_recipient_fk",
  }).onDelete("cascade"),
  foreignKey({
    columns: [table.deviceRegistrationId, table.recipientId],
    foreignColumns: [pushDevices.id, pushDevices.userId],
    name: "notification_deliveries_device_recipient_fk",
  }).onDelete("cascade"),
  index("notification_deliveries_due_idx").on(table.status, table.availableAt),
  index("notification_deliveries_lease_idx").on(table.status, table.leaseExpiresAt),
  index("notification_deliveries_recipient_idx").on(table.recipientId, table.createdAt),
  check("notification_deliveries_attempts_check", sql`${table.attempts} between 0 and 20`),
  check("notification_deliveries_lease_pair_check", sql`(${table.leaseToken} is null) = (${table.leaseExpiresAt} is null)`),
  check("notification_deliveries_status_lease_check", sql`
    (${table.status} = 'leased' and ${table.leaseToken} is not null) or
    (${table.status} <> 'leased' and ${table.leaseToken} is null)
  `),
  check("notification_deliveries_terminal_check", sql`
    (${table.status} = 'delivered' and ${table.deliveredAt} is not null) or
    (${table.status} <> 'delivered' and ${table.deliveredAt} is null)
  `),
  check("notification_deliveries_failure_check", sql`${table.failureCategory} is null or char_length(${table.failureCategory}) between 1 and 100`),
]);
