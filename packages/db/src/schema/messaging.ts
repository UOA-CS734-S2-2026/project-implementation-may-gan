import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  index,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { user } from "./users";

export const conversationKind = pgEnum("conversation_kind", ["direct"]);
export const messageRequestState = pgEnum("message_request_state", ["pending", "active", "declined"]);
export const messagingOutboxChannel = pgEnum("messaging_outbox_channel", ["realtime", "push"]);
export const messagingOutboxStatus = pgEnum("messaging_outbox_status", ["pending", "leased", "delivered", "failed"]);
export const pushPlatform = pgEnum("push_platform", ["ios", "android"]);

/** The unordered direct pair is immutable and unique. No group representation exists in V1. */
export const conversations = pgTable("conversations", {
  id: text("id").primaryKey(),
  kind: conversationKind("kind").notNull().default("direct"),
  userLowId: text("user_low_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  userHighId: text("user_high_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  initiatorId: text("initiator_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  requestState: messageRequestState("request_state").notNull(),
  lastMessageSequence: bigint("last_message_sequence", { mode: "number" }).notNull(),
  lastChangeSequence: bigint("last_change_sequence", { mode: "number" }).notNull(),
  lastActivityAt: timestamp("last_activity_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
}, (table) => [
  unique("conversations_direct_pair_unique").on(table.userLowId, table.userHighId),
  index("conversations_activity_idx").on(table.lastActivityAt, table.id),
  check("conversations_direct_pair_order_check", sql`${table.userLowId} < ${table.userHighId}`),
  check("conversations_initiator_member_check", sql`${table.initiatorId} in (${table.userLowId}, ${table.userHighId})`),
]);

export const conversationMembers = pgTable("conversation_members", {
  conversationId: text("conversation_id").notNull().references(() => conversations.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  lastReadSequence: bigint("last_read_sequence", { mode: "number" }).notNull(),
  receiptSequence: bigint("receipt_sequence", { mode: "number" }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
}, (table) => [
  primaryKey({ name: "conversation_members_pk", columns: [table.conversationId, table.userId] }),
  index("conversation_members_user_conversation_idx").on(table.userId, table.conversationId),
  check("conversation_members_receipt_read_check", sql`${table.receiptSequence} <= ${table.lastReadSequence}`),
]);

export const messages = pgTable("messages", {
  id: text("id").primaryKey(),
  conversationId: text("conversation_id").notNull().references(() => conversations.id, { onDelete: "cascade" }),
  sequence: bigint("sequence", { mode: "number" }).notNull(),
  senderId: text("sender_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  clientMessageId: text("client_message_id").notNull(),
  requestFingerprint: text("request_fingerprint").notNull(),
  body: text("body"),
  replyToMessageId: text("reply_to_message_id"),
  version: bigint("version", { mode: "number" }).notNull().default(1),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  editedAt: timestamp("edited_at", { withTimezone: true }),
  unsentAt: timestamp("unsent_at", { withTimezone: true }),
}, (table) => [
  unique("messages_conversation_sequence_unique").on(table.conversationId, table.sequence),
  unique("messages_sender_client_message_unique").on(table.senderId, table.clientMessageId),
  index("messages_conversation_sequence_idx").on(table.conversationId, table.sequence),
  check("messages_sequence_positive_check", sql`${table.sequence} > 0`),
  check("messages_version_positive_check", sql`${table.version} > 0`),
  check("messages_body_or_tombstone_check", sql`(${table.body} is not null and ${table.unsentAt} is null) or (${table.body} is null and ${table.unsentAt} is not null)`),
]);

export const messageReactions = pgTable("message_reactions", {
  messageId: text("message_id").notNull().references(() => messages.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  reaction: text("reaction").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
}, (table) => [
  primaryKey({ name: "message_reactions_pk", columns: [table.messageId, table.userId] }),
  check("message_reactions_key_check", sql`${table.reaction} in ('like', 'love', 'laugh', 'surprised', 'sad', 'thanks')`),
]);

export const conversationChanges = pgTable("conversation_changes", {
  conversationId: text("conversation_id").notNull().references(() => conversations.id, { onDelete: "cascade" }),
  changeSequence: bigint("change_sequence", { mode: "number" }).notNull(),
  kind: text("kind").notNull(),
  messageId: text("message_id").references(() => messages.id, { onDelete: "cascade" }),
  memberId: text("member_id").references(() => user.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
}, (table) => [
  primaryKey({ name: "conversation_changes_pk", columns: [table.conversationId, table.changeSequence] }),
  index("conversation_changes_conversation_sequence_idx").on(table.conversationId, table.changeSequence),
]);

/** Body-free delivery intent. Realtime and each push device are isolated jobs. */
export const messagingOutbox = pgTable("messaging_outbox", {
  id: text("id").primaryKey(),
  eventId: text("event_id").notNull(),
  recipientId: text("recipient_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  conversationId: text("conversation_id").notNull().references(() => conversations.id, { onDelete: "cascade" }),
  changeSequence: bigint("change_sequence", { mode: "number" }).notNull(),
  channel: messagingOutboxChannel("channel").notNull(),
  deviceRegistrationId: text("device_registration_id"),
  status: messagingOutboxStatus("status").notNull().default("pending"),
  attempts: bigint("attempts", { mode: "number" }).notNull().default(0),
  availableAt: timestamp("available_at", { withTimezone: true }).notNull(),
  leaseToken: text("lease_token"),
  leaseExpiresAt: timestamp("lease_expires_at", { withTimezone: true }),
  failureCategory: text("failure_category"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  deliveredAt: timestamp("delivered_at", { withTimezone: true }),
}, (table) => [
  // PostgreSQL 18 NULLS NOT DISTINCT index is declared in migration 0009.
  // Drizzle's index builder cannot model this option yet.
  uniqueIndex("messaging_outbox_destination_unique").on(table.eventId, table.recipientId, table.channel, table.deviceRegistrationId),
  index("messaging_outbox_due_idx").on(table.status, table.availableAt),
  index("messaging_outbox_lease_idx").on(table.status, table.leaseExpiresAt),
  check("messaging_outbox_attempts_check", sql`${table.attempts} >= 0`),
]);

export const socketTickets = pgTable("socket_tickets", {
  tokenHash: text("token_hash").primaryKey(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  sessionId: text("session_id").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  sessionExpiresAt: timestamp("session_expires_at", { withTimezone: true }).notNull(),
  consumedAt: timestamp("consumed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
}, (table) => [index("socket_tickets_expiry_idx").on(table.expiresAt), index("socket_tickets_session_idx").on(table.sessionId)]);

export const pushDevices = pgTable("push_devices", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  sessionId: text("session_id").notNull(),
  installationId: text("installation_id").notNull(),
  platform: pushPlatform("platform").notNull(),
  token: text("token").notNull(),
  tokenHash: text("token_hash").notNull(),
  optedIn: boolean("opted_in").notNull().default(true),
  registeredAt: timestamp("registered_at", { withTimezone: true }).notNull(),
  invalidatedAt: timestamp("invalidated_at", { withTimezone: true }),
}, (table) => [
  unique("push_devices_token_hash_unique").on(table.tokenHash),
  unique("push_devices_user_installation_unique").on(table.userId, table.installationId),
  index("push_devices_user_enabled_idx").on(table.userId, table.optedIn),
]);
