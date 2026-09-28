import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { user } from "./users";

export const friendshipState = pgEnum("friendship_state", ["active", "ended"]);
export const friendRequestStatus = pgEnum("friend_request_status", [
  "pending",
  "accepted",
  "declined",
  "cancelled",
]);

/** The current directional projection; accepted friendships always write both rows. */
export const friendships = pgTable("friendships", {
  userId: text("user_id").notNull().references(() => user.id),
  friendId: text("friend_id").notNull().references(() => user.id),
  state: friendshipState("state").notNull(),
  stateChangedAt: timestamp("state_changed_at", { withTimezone: true }).notNull(),
}, (table) => [
  uniqueIndex("friendships_pair_unique").on(table.userId, table.friendId),
  index("friendships_friend_id_idx").on(table.friendId),
  check("friendships_distinct_users_check", sql`${table.userId} <> ${table.friendId}`),
]);

/** Requests retain terminal rows so send throttling counts every send attempt. */
export const friendRequests = pgTable("friend_requests", {
  id: text("id").primaryKey(),
  senderId: text("sender_id").notNull().references(() => user.id),
  recipientId: text("recipient_id").notNull().references(() => user.id),
  status: friendRequestStatus("status").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
}, (table) => [
  uniqueIndex("friend_requests_pending_pair_unique")
    .on(sql`least(${table.senderId}, ${table.recipientId})`, sql`greatest(${table.senderId}, ${table.recipientId})`)
    .where(sql`${table.status} = 'pending'`),
  index("friend_requests_recipient_status_created_idx").on(table.recipientId, table.status, table.createdAt, table.id),
  index("friend_requests_sender_recipient_created_idx").on(table.senderId, table.recipientId, table.createdAt),
  check("friend_requests_distinct_users_check", sql`${table.senderId} <> ${table.recipientId}`),
  check(
    "friend_requests_resolution_check",
    sql`(${table.status} = 'pending' and ${table.resolvedAt} is null) or (${table.status} <> 'pending' and ${table.resolvedAt} is not null)`,
  ),
]);

/** Active blocks are directional and retained as a current projection. */
export const relationshipBlocks = pgTable("relationship_blocks", {
  blockerId: text("blocker_id").notNull().references(() => user.id),
  blockedId: text("blocked_id").notNull().references(() => user.id),
  blockedAt: timestamp("blocked_at", { withTimezone: true }).notNull(),
  unblockedAt: timestamp("unblocked_at", { withTimezone: true }),
}, (table) => [
  uniqueIndex("relationship_blocks_pair_unique").on(table.blockerId, table.blockedId),
  index("relationship_blocks_blocked_id_idx").on(table.blockedId),
  check("relationship_blocks_distinct_users_check", sql`${table.blockerId} <> ${table.blockedId}`),
]);

/** A persistent, actor-scoped quota for username discovery. */
export const relationshipSearchQuota = pgTable("relationship_search_quota", {
  actorId: text("actor_id").primaryKey().references(() => user.id, { onDelete: "cascade" }),
  windowStartedAt: timestamp("window_started_at", { withTimezone: true }).notNull(),
  requestCount: integer("request_count").notNull(),
});

export type Friendship = typeof friendships.$inferSelect;
export type FriendRequest = typeof friendRequests.$inferSelect;
export type RelationshipBlock = typeof relationshipBlocks.$inferSelect;
