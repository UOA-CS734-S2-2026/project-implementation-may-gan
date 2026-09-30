import { sql } from "drizzle-orm";
import { bigint, check, index, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { session, user } from "./index";
import { accountManagementGrantAction } from "./lifecycle";

/** Server-owned OAuth continuation. It never stores provider bearer material. */
export const accountGoogleReauthenticationIntents = pgTable("account_google_reauthentication_intents", {
  stateDigest: text("state_digest").primaryKey(),
  nonceDigest: text("nonce_digest").notNull(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  sessionId: text("session_id").notNull().references(() => session.id, { onDelete: "cascade" }),
  action: accountManagementGrantAction("action").notNull(),
  lifecycleGeneration: bigint("lifecycle_generation", { mode: "number" }).notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  consumedAt: timestamp("consumed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("account_google_reauth_intents_session_idx").on(table.sessionId),
  check("account_google_reauth_intents_state_digest_check", sql`${table.stateDigest} ~ '^[0-9a-f]{64}$'`),
  check("account_google_reauth_intents_nonce_digest_check", sql`${table.nonceDigest} ~ '^[0-9a-f]{64}$'`),
  check("account_google_reauth_intents_generation_check", sql`${table.lifecycleGeneration} >= 0`),
  check("account_google_reauth_intents_expiry_check", sql`${table.expiresAt} > ${table.createdAt}`),
  check("account_google_reauth_intents_consumed_check", sql`${table.consumedAt} is null or ${table.consumedAt} <= ${table.expiresAt}`),
]);
