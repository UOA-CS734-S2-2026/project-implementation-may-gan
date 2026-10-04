import { sql } from "drizzle-orm";
import {
  bigint,
  check,
  date,
  foreignKey,
  index,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";
import { user } from "./users";

export const futureSelfNoteStatus = pgEnum("future_self_note_status", ["scheduled", "delivered"]);

export const futureSelfNoteDeliveryStatus = pgEnum("future_self_note_delivery_status", ["claimed", "delivered"]);

/**
 * A standalone, owner-only note written for a chosen Auckland date. It is not
 * attached to a post and is separate from the tomorrow note. The body is
 * private even to its owner until deliverOn arrives, so list projections must
 * never select it. scheduleVersion increases whenever deliverOn changes, which
 * invalidates any delivery claimed for the earlier date.
 *
 * Purge order: delivery rows, then these notes, then the account. The user
 * foreign key is NO ACTION so an account cannot be removed while notes remain.
 */
export const futureSelfNotes = pgTable("future_self_notes", {
  id: text("id").primaryKey(),
  ownerId: text("owner_id").notNull().references(() => user.id),
  body: text("body").notNull(),
  deliverOn: date("deliver_on", { mode: "string" }).notNull(),
  status: futureSelfNoteStatus("status").notNull().default("scheduled"),
  scheduleVersion: bigint("schedule_version", { mode: "number" }).notNull().default(1),
  deliveredAt: timestamp("delivered_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("future_self_notes_owner_deliver_on_idx").on(table.ownerId, table.deliverOn, table.id),
  // The scheduled delivery scan reads only notes that are still waiting.
  index("future_self_notes_due_idx").on(table.deliverOn, table.id).where(sql`${table.status} = 'scheduled'`),
  check(
    "future_self_notes_body_length_check",
    sql`char_length(${table.body}) between 1 and 1000 and ${table.body} = btrim(${table.body})`,
  ),
  check("future_self_notes_schedule_version_check", sql`${table.scheduleVersion} between 1 and 9007199254740991`),
  check(
    "future_self_notes_delivery_state_check",
    sql`(${table.status} = 'scheduled' and ${table.deliveredAt} is null)
      or (${table.status} = 'delivered' and ${table.deliveredAt} is not null)`,
  ),
]);

/**
 * The accepted outcome of a retriable create. Rows follow their note, so
 * deleting the note also forgets its key.
 */
export const futureSelfNoteIdempotencyKeys = pgTable("future_self_note_idempotency_keys", {
  ownerId: text("owner_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  idempotencyKey: text("idempotency_key").notNull(),
  requestFingerprint: text("request_fingerprint").notNull(),
  noteId: text("note_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  foreignKey({ columns: [table.noteId], foreignColumns: [futureSelfNotes.id], name: "future_self_note_keys_note_id_fk" }).onDelete("cascade"),
  primaryKey({ name: "future_self_note_idempotency_keys_pk", columns: [table.ownerId, table.idempotencyKey] }),
  index("future_self_note_idempotency_keys_note_id_idx").on(table.noteId),
  check(
    "future_self_note_idempotency_keys_key_check",
    sql`char_length(${table.idempotencyKey}) between 1 and 255`,
  ),
  check(
    "future_self_note_idempotency_keys_fingerprint_check",
    sql`${table.requestFingerprint} ~ '^[0-9a-f]{64}$'`,
  ),
]);

/**
 * The reminder for one scheduled delivery. (noteId, scheduleVersion) is the
 * delivery key, so one schedule can be delivered at most once however many
 * jobs run, and concurrently. A job claims the row under a lease, then either
 * completes it or drops it when the note, its owner, or its schedule no longer
 * allows delivery. It holds no note text and sends nothing: push delivery is a
 * separate feature.
 */
export const futureSelfNoteDeliveries = pgTable("future_self_note_deliveries", {
  id: text("id").primaryKey(),
  noteId: text("note_id").notNull().references(() => futureSelfNotes.id, { onDelete: "cascade" }),
  scheduleVersion: bigint("schedule_version", { mode: "number" }).notNull(),
  deliverOn: date("deliver_on", { mode: "string" }).notNull(),
  status: futureSelfNoteDeliveryStatus("status").notNull().default("claimed"),
  leaseToken: text("lease_token"),
  leaseExpiresAt: timestamp("lease_expires_at", { withTimezone: true }),
  attempts: bigint("attempts", { mode: "number" }).notNull().default(1),
  claimedAt: timestamp("claimed_at", { withTimezone: true }).defaultNow().notNull(),
  deliveredAt: timestamp("delivered_at", { withTimezone: true }),
}, (table) => [
  unique("future_self_note_deliveries_note_version_unique").on(table.noteId, table.scheduleVersion),
  // Finds claims whose lease expired so another job can finish them.
  index("future_self_note_deliveries_lease_idx").on(table.leaseExpiresAt).where(sql`${table.status} = 'claimed'`),
  check("future_self_note_deliveries_schedule_version_check", sql`${table.scheduleVersion} between 1 and 9007199254740991`),
  check("future_self_note_deliveries_attempts_check", sql`${table.attempts} between 1 and 9007199254740991`),
  check(
    "future_self_note_deliveries_state_check",
    sql`(${table.status} = 'claimed' and ${table.leaseToken} is not null and ${table.leaseExpiresAt} is not null and ${table.deliveredAt} is null)
      or (${table.status} = 'delivered' and ${table.leaseToken} is null and ${table.leaseExpiresAt} is null and ${table.deliveredAt} is not null)`,
  ),
]);
