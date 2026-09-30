import { sql } from "drizzle-orm";
import {
  bigint,
  check,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { session, user } from "./index";

export const accountLifecycleState = pgEnum("account_lifecycle_state", [
  "active",
  "pending_deletion",
  "purging",
  "purge_failed",
]);

export const accountManagementGrantAction = pgEnum("account_management_grant_action", [
  "request_deletion",
  "cancel_deletion",
]);

export const dataExportStatus = pgEnum("data_export_status", [
  "requested",
  "building",
  "ready",
  "failed",
  "cancelled",
  "expired",
]);

export const purgeReceiptOutcome = pgEnum("purge_receipt_outcome", ["completed"]);

export const operatorCaseType = pgEnum("operator_case_type", ["underage_report"]);
export const operatorCaseStatus = pgEnum("operator_case_status", ["open", "reviewed", "restricted", "closed"]);
export const operatorCaseDecision = pgEnum("operator_case_decision", ["no_action", "temporary_restriction"]);

/**
 * The current account lifecycle state. This record is not itself a permission
 * check or a purge worker. Commands must use PostgreSQL time, row locking, and
 * generation comparisons when the #161 orchestration slice is implemented.
 */
export const accountLifecycles = pgTable("account_lifecycles", {
  userId: text("user_id").primaryKey().references(() => user.id, { onDelete: "cascade" }),
  state: accountLifecycleState("state").notNull().default("active"),
  requestId: text("request_id"),
  idempotencyKeyDigest: text("idempotency_key_digest"),
  generation: bigint("generation", { mode: "number" }).notNull().default(0),
  requestedAt: timestamp("requested_at", { withTimezone: true }),
  cancelUntil: timestamp("cancel_until", { withTimezone: true }),
  purgeDueAt: timestamp("purge_due_at", { withTimezone: true }),
  purgeStartedAt: timestamp("purge_started_at", { withTimezone: true }),
  lastErrorCategory: text("last_error_category"),
  nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }),
  leaseToken: text("lease_token"),
  leaseExpiresAt: timestamp("lease_expires_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  unique("account_lifecycles_request_id_unique").on(table.requestId),
  index("account_lifecycles_due_idx").on(table.state, table.cancelUntil, table.purgeDueAt),
  index("account_lifecycles_retry_idx").on(table.state, table.nextAttemptAt),
  index("account_lifecycles_lease_idx").on(table.state, table.leaseExpiresAt),
  check("account_lifecycles_generation_check", sql`${table.generation} >= 0`),
  check("account_lifecycles_request_id_check", sql`${table.requestId} is null or char_length(${table.requestId}) between 1 and 200`),
  check("account_lifecycles_idempotency_key_digest_check", sql`${table.idempotencyKeyDigest} is null or ${table.idempotencyKeyDigest} ~ '^[0-9a-f]{64}$'`),
  check("account_lifecycles_error_category_check", sql`${table.lastErrorCategory} is null or char_length(${table.lastErrorCategory}) between 1 and 100`),
  check("account_lifecycles_lease_pair_check", sql`(${table.leaseToken} is null) = (${table.leaseExpiresAt} is null)`),
  check("account_lifecycles_lease_token_check", sql`${table.leaseToken} is null or char_length(${table.leaseToken}) between 1 and 200`),
  check("account_lifecycles_deadline_check", sql`
    (${table.state} = 'active' and
      ${table.requestId} is null and ${table.idempotencyKeyDigest} is null and
      ${table.requestedAt} is null and ${table.cancelUntil} is null and ${table.purgeDueAt} is null and
      ${table.purgeStartedAt} is null and ${table.lastErrorCategory} is null and ${table.nextAttemptAt} is null) or
    (${table.state} = 'pending_deletion' and
      ${table.requestId} is not null and ${table.idempotencyKeyDigest} is not null and
      ${table.requestedAt} is not null and ${table.cancelUntil} = ${table.requestedAt} + interval '7 days' and
      ${table.purgeDueAt} = ${table.requestedAt} + interval '14 days' and
      ${table.purgeStartedAt} is null and ${table.lastErrorCategory} is null and ${table.nextAttemptAt} is null) or
    (${table.state} = 'purging' and
      ${table.requestId} is not null and ${table.idempotencyKeyDigest} is not null and
      ${table.requestedAt} is not null and ${table.cancelUntil} = ${table.requestedAt} + interval '7 days' and
      ${table.purgeDueAt} = ${table.requestedAt} + interval '14 days' and
      ${table.purgeStartedAt} is not null and ${table.lastErrorCategory} is null and ${table.nextAttemptAt} is null) or
    (${table.state} = 'purge_failed' and
      ${table.requestId} is not null and ${table.idempotencyKeyDigest} is not null and
      ${table.requestedAt} is not null and ${table.cancelUntil} = ${table.requestedAt} + interval '7 days' and
      ${table.purgeDueAt} = ${table.requestedAt} + interval '14 days' and
      ${table.purgeStartedAt} is not null and ${table.lastErrorCategory} is not null and ${table.nextAttemptAt} is not null)
  `),
]);

/** A short-lived, single-use reauthentication grant. Only its digest is stored. */
export const accountManagementGrants = pgTable("account_management_grants", {
  tokenDigest: text("token_digest").primaryKey(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  sessionId: text("session_id").notNull().references(() => session.id, { onDelete: "cascade" }),
  action: accountManagementGrantAction("action").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  consumedAt: timestamp("consumed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("account_management_grants_user_action_expires_idx").on(table.userId, table.action, table.expiresAt),
  index("account_management_grants_session_idx").on(table.sessionId),
  check("account_management_grants_digest_check", sql`${table.tokenDigest} ~ '^[0-9a-f]{64}$'`),
  check("account_management_grants_expiry_check", sql`${table.expiresAt} > ${table.createdAt}`),
  check("account_management_grants_consumed_check", sql`${table.consumedAt} is null or ${table.consumedAt} <= ${table.expiresAt}`),
]);

/**
 * An export request is fenced by the lifecycle generation captured at request
 * time. Archive object keys are personal data and must never enter logs.
 */
export const dataExportRequests = pgTable("data_export_requests", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  lifecycleGeneration: bigint("lifecycle_generation", { mode: "number" }).notNull(),
  status: dataExportStatus("status").notNull().default("requested"),
  requestedAt: timestamp("requested_at", { withTimezone: true }).defaultNow().notNull(),
  snapshotCutoffAt: timestamp("snapshot_cutoff_at", { withTimezone: true }),
  archiveObjectKey: text("archive_object_key"),
  readyAt: timestamp("ready_at", { withTimezone: true }),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  leaseToken: text("lease_token"),
  leaseExpiresAt: timestamp("lease_expires_at", { withTimezone: true }),
  failureCategory: text("failure_category"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("data_export_requests_due_idx").on(table.status, table.requestedAt),
  index("data_export_requests_expiry_idx").on(table.status, table.expiresAt),
  index("data_export_requests_lease_idx").on(table.status, table.leaseExpiresAt),
  uniqueIndex("data_export_requests_one_active_per_user_unique")
    .on(table.userId)
    .where(sql`${table.status} in ('requested', 'building', 'ready')`),
  check("data_export_requests_generation_check", sql`${table.lifecycleGeneration} >= 0`),
  check("data_export_requests_id_check", sql`char_length(${table.id}) between 1 and 200`),
  check("data_export_requests_archive_key_check", sql`${table.archiveObjectKey} is null or char_length(${table.archiveObjectKey}) between 1 and 1024`),
  check("data_export_requests_failure_category_check", sql`${table.failureCategory} is null or char_length(${table.failureCategory}) between 1 and 100`),
  check("data_export_requests_lease_pair_check", sql`(${table.leaseToken} is null) = (${table.leaseExpiresAt} is null)`),
  check("data_export_requests_ready_expiry_check", sql`
    (${table.status} = 'ready' and ${table.snapshotCutoffAt} is not null and ${table.archiveObjectKey} is not null and
      ${table.readyAt} is not null and ${table.expiresAt} = ${table.readyAt} + interval '24 hours' and ${table.failureCategory} is null) or
    (${table.status} in ('requested', 'building') and ${table.readyAt} is null and ${table.expiresAt} is null and ${table.failureCategory} is null) or
    (${table.status} = 'failed' and ${table.failureCategory} is not null and ${table.readyAt} is null and ${table.expiresAt} is null) or
    (${table.status} in ('cancelled', 'expired') and ${table.readyAt} is null and ${table.expiresAt} is null)
  `),
]);

/**
 * Minimal completion evidence retained after the user and lifecycle rows are
 * gone. The subject digest and request reference remain personal data because
 * they can be linkable, so neither is an application-visible profile field.
 */
export const accountPurgeReceipts = pgTable("account_purge_receipts", {
  requestId: text("request_id").primaryKey(),
  subjectDigest: text("subject_digest").notNull(),
  requestedAt: timestamp("requested_at", { withTimezone: true }).notNull(),
  completedAt: timestamp("completed_at", { withTimezone: true }).notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  outcome: purgeReceiptOutcome("outcome").notNull().default("completed"),
  completedStageCount: integer("completed_stage_count").notNull(),
}, (table) => [
  index("account_purge_receipts_expiry_idx").on(table.expiresAt),
  check("account_purge_receipts_request_id_check", sql`char_length(${table.requestId}) between 1 and 200`),
  check("account_purge_receipts_subject_digest_check", sql`${table.subjectDigest} ~ '^[0-9a-f]{64}$'`),
  check("account_purge_receipts_completion_check", sql`${table.completedAt} >= ${table.requestedAt}`),
  check("account_purge_receipts_expiry_check", sql`${table.expiresAt} = ${table.completedAt} + interval '30 days'`),
  check("account_purge_receipts_stage_count_check", sql`${table.completedStageCount} between 0 and 20`),
]);

/**
 * A content-free case opened only after a human finds an underage report
 * credible enough to record. There is no raw report body, reporter contact, or
 * automatic state transition in this foundation schema.
 */
export const operatorCases = pgTable("operator_cases", {
  id: text("id").primaryKey(),
  subjectUserId: text("subject_user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  type: operatorCaseType("type").notNull(),
  status: operatorCaseStatus("status").notNull().default("open"),
  decision: operatorCaseDecision("decision"),
  reasonCategory: text("reason_category"),
  operatorReference: text("operator_reference"),
  reviewDueAt: timestamp("review_due_at", { withTimezone: true }).notNull(),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("operator_cases_subject_status_idx").on(table.subjectUserId, table.status),
  index("operator_cases_review_due_idx").on(table.status, table.reviewDueAt),
  check("operator_cases_id_check", sql`char_length(${table.id}) between 1 and 200`),
  check("operator_cases_reason_category_check", sql`${table.reasonCategory} is null or char_length(${table.reasonCategory}) between 1 and 100`),
  check("operator_cases_operator_reference_check", sql`${table.operatorReference} is null or char_length(${table.operatorReference}) between 1 and 200`),
  check("operator_cases_state_check", sql`
    (${table.status} = 'open' and ${table.decision} is null and ${table.reviewedAt} is null and ${table.resolvedAt} is null) or
    (${table.status} = 'reviewed' and ${table.decision} = 'no_action' and ${table.reviewedAt} is not null and ${table.resolvedAt} is null) or
    (${table.status} = 'restricted' and ${table.decision} = 'temporary_restriction' and ${table.reviewedAt} is not null and ${table.resolvedAt} is null) or
    (${table.status} = 'closed' and ${table.decision} is not null and ${table.reviewedAt} is not null and ${table.resolvedAt} is not null)
  `),
]);
