import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  foreignKey,
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

/** Cleanup succeeds by removing its task. Retry state remains durable until then. */
export const dataExportObjectCleanupStatus = pgEnum("data_export_object_cleanup_status", [
  "pending",
  "deleting",
  "failed",
]);

export const purgeReceiptOutcome = pgEnum("purge_receipt_outcome", ["completed"]);
export const accountPurgeObjectCleanupStatus = pgEnum("account_purge_object_cleanup_status", [
  "pending", "deleting", "failed", "completed",
]);
export const accountRealtimeRevocationStatus = pgEnum("account_realtime_revocation_status", [
  "pending", "leased", "completed", "superseded", "failed",
]);

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
  check("account_lifecycles_generation_check", sql`${table.generation} between 0 and 9007199254740991`),
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
      ${table.requestedAt} is not null and ${table.cancelUntil} = ${table.requestedAt} + interval '168 hours' and
      ${table.purgeDueAt} = ${table.requestedAt} + interval '336 hours' and
      ${table.purgeStartedAt} is null and ${table.lastErrorCategory} is null and ${table.nextAttemptAt} is null) or
    (${table.state} = 'purging' and
      ${table.requestId} is not null and ${table.idempotencyKeyDigest} is not null and
      ${table.requestedAt} is not null and ${table.cancelUntil} = ${table.requestedAt} + interval '168 hours' and
      ${table.purgeDueAt} = ${table.requestedAt} + interval '336 hours' and
      ${table.purgeStartedAt} is not null and ${table.lastErrorCategory} is null and ${table.nextAttemptAt} is null) or
    (${table.state} = 'purge_failed' and
      ${table.requestId} is not null and ${table.idempotencyKeyDigest} is not null and
      ${table.requestedAt} is not null and ${table.cancelUntil} = ${table.requestedAt} + interval '168 hours' and
      ${table.purgeDueAt} = ${table.requestedAt} + interval '336 hours' and
      ${table.purgeStartedAt} is not null and ${table.lastErrorCategory} is not null and ${table.nextAttemptAt} is not null)
  `),
]);

/** Durable, content-free intent to close every socket from one deletion generation. */
export const accountRealtimeRevocations = pgTable("account_realtime_revocations", {
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  lifecycleGeneration: bigint("lifecycle_generation", { mode: "number" }).notNull(),
  status: accountRealtimeRevocationStatus("status").notNull().default("pending"),
  attemptCount: integer("attempt_count").notNull().default(0),
  nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }),
  leaseToken: text("lease_token"),
  leaseExpiresAt: timestamp("lease_expires_at", { withTimezone: true }),
  failureCategory: text("failure_category"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  retentionExpiresAt: timestamp("retention_expires_at", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  unique("account_realtime_revocations_user_generation_unique").on(table.userId, table.lifecycleGeneration),
  index("account_realtime_revocations_due_idx").on(table.status, table.nextAttemptAt),
  index("account_realtime_revocations_lease_idx").on(table.status, table.leaseExpiresAt),
  index("account_realtime_revocations_retention_idx").on(table.status, table.retentionExpiresAt),
  check("account_realtime_revocations_generation_check", sql`${table.lifecycleGeneration} between 1 and 9007199254740991`),
  check("account_realtime_revocations_attempt_check", sql`${table.attemptCount} >= 0`),
  check("account_realtime_revocations_lease_pair_check", sql`(${table.leaseToken} is null) = (${table.leaseExpiresAt} is null)`),
  check("account_realtime_revocations_state_check", sql`
    (${table.status} = 'pending' and ${table.nextAttemptAt} is not null and ${table.leaseToken} is null and ${table.completedAt} is null and ${table.retentionExpiresAt} is null) or
    (${table.status} = 'leased' and ${table.nextAttemptAt} is null and ${table.leaseToken} is not null and ${table.completedAt} is null and ${table.retentionExpiresAt} is null) or
    (${table.status} in ('completed', 'superseded', 'failed') and ${table.nextAttemptAt} is null and ${table.leaseToken} is null and ${table.completedAt} is not null and ${table.retentionExpiresAt} = ${table.completedAt} + interval '720 hours')
  `),
]);

/** A short-lived, single-use reauthentication grant. Only its digest is stored. */
export const accountManagementGrants = pgTable("account_management_grants", {
  tokenDigest: text("token_digest").primaryKey(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  sessionId: text("session_id").notNull().references(() => session.id, { onDelete: "cascade" }),
  action: accountManagementGrantAction("action").notNull(),
  lifecycleGeneration: bigint("lifecycle_generation", { mode: "number" }).notNull().default(0),
  credentialHashDigest: text("credential_hash_digest"),
  googleSubjectDigest: text("google_subject_digest"),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  consumedAt: timestamp("consumed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("account_management_grants_user_action_expires_idx").on(table.userId, table.action, table.expiresAt),
  index("account_management_grants_session_idx").on(table.sessionId),
  check("account_management_grants_digest_check", sql`${table.tokenDigest} ~ '^[0-9a-f]{64}$'`),
  check("account_management_grants_generation_check", sql`${table.lifecycleGeneration} between 0 and 9007199254740991`),
  check("account_management_grants_credential_digest_check", sql`${table.credentialHashDigest} is null or ${table.credentialHashDigest} ~ '^[0-9a-f]{64}$'`),
  check("account_management_grants_google_digest_check", sql`${table.googleSubjectDigest} is null or ${table.googleSubjectDigest} ~ '^[0-9a-f]{64}$'`),
  check("account_management_grants_single_proof_check", sql`${table.credentialHashDigest} is null or ${table.googleSubjectDigest} is null`),
  check("account_management_grants_expiry_check", sql`${table.expiresAt} > ${table.createdAt}`),
  check("account_management_grants_consumed_check", sql`${table.consumedAt} is null or ${table.consumedAt} <= ${table.expiresAt}`),
]);

/**
 * A durable private-object cleanup retry. A task is deleted only after its R2
 * object is gone. It intentionally has no user foreign key, so it remains
 * actionable after a terminal export request is removed during later cleanup.
 */
export const dataExportObjectCleanupTasks = pgTable("data_export_object_cleanup_tasks", {
  id: text("id").primaryKey(),
  archiveObjectKey: text("archive_object_key").notNull(),
  uploadId: text("upload_id"),
  uploadStartedAt: timestamp("upload_started_at", { withTimezone: true }),
  verifiedAbsentAt: timestamp("verified_absent_at", { withTimezone: true }),
  status: dataExportObjectCleanupStatus("status").notNull().default("pending"),
  attemptCount: integer("attempt_count").notNull().default(0),
  nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }),
  leaseToken: text("lease_token"),
  leaseExpiresAt: timestamp("lease_expires_at", { withTimezone: true }),
  failureCategory: text("failure_category"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("data_export_object_cleanup_tasks_due_idx").on(table.status, table.nextAttemptAt),
  index("data_export_object_cleanup_tasks_lease_idx").on(table.status, table.leaseExpiresAt),
  check("data_export_object_cleanup_tasks_id_check", sql`char_length(${table.id}) between 1 and 200`),
  check("data_export_object_cleanup_tasks_archive_key_check", sql`char_length(${table.archiveObjectKey}) between 1 and 1024`),
  check("data_export_cleanup_upload_pair_check", sql`(${table.uploadId} is null) = (${table.uploadStartedAt} is null)`),
  check("data_export_cleanup_upload_id_check", sql`${table.uploadId} is null or (char_length(${table.uploadId}) between 1 and 512 and ${table.uploadId} ~ '^[A-Za-z0-9_+/=-]+$')`),
  check("data_export_object_cleanup_tasks_attempt_count_check", sql`${table.attemptCount} >= 0`),
  check("data_export_object_cleanup_tasks_failure_category_check", sql`${table.failureCategory} is null or char_length(${table.failureCategory}) between 1 and 100`),
  check("data_export_object_cleanup_tasks_lease_pair_check", sql`(${table.leaseToken} is null) = (${table.leaseExpiresAt} is null)`),
  check("data_export_object_cleanup_tasks_state_check", sql`
    (${table.status} = 'pending' and ${table.failureCategory} is null and ${table.leaseToken} is null and ${table.nextAttemptAt} is not null) or
    (${table.status} = 'deleting' and ${table.failureCategory} is null and ${table.leaseToken} is not null and ${table.nextAttemptAt} is null) or
    (${table.status} = 'failed' and ${table.failureCategory} is not null and ${table.leaseToken} is null and ${table.nextAttemptAt} is not null)
  `),
]);

/**
 * An export request is fenced by the lifecycle generation captured at request
 * time. Archive object keys are personal data and must never enter logs.
 * Terminal rows clear their archive and snapshot fields. If an archive needs
 * deletion, archiveCleanupTaskId references the durable private cleanup task.
 */
export const dataExportCleanupIncidents = pgTable("data_export_cleanup_incidents", {
  id: text("id").primaryKey(),
  failureCategory: text("failure_category").notNull(),
  failureCount: bigint("failure_count", { mode: "number" }).notNull().default(1),
  firstFailedAt: timestamp("first_failed_at", { withTimezone: true }).notNull(),
  lastFailedAt: timestamp("last_failed_at", { withTimezone: true }).notNull(),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
}, (table) => [
  index("data_export_cleanup_incidents_expiry_idx").on(table.expiresAt).where(sql`${table.expiresAt} is not null`),
  check("data_export_cleanup_incident_digest_check", sql`${table.id} ~ '^[0-9a-f]{64}$'`),
  check("data_export_cleanup_incident_category_check", sql`${table.failureCategory} = 'storage'`),
  check("data_export_cleanup_incident_count_check", sql`${table.failureCount} between 1 and 9007199254740991`),
  check("data_export_cleanup_incident_clock_check", sql`${table.lastFailedAt} >= ${table.firstFailedAt} and (${table.resolvedAt} is null or ${table.resolvedAt} >= ${table.lastFailedAt})`),
  check("data_export_cleanup_incident_retention_check", sql`(${table.resolvedAt} is null and ${table.expiresAt} is null) or (${table.resolvedAt} is not null and ${table.expiresAt} = ${table.resolvedAt} + interval '720 hours')`),
]);

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
  archiveCleanupTaskId: text("archive_cleanup_task_id"),
  leaseToken: text("lease_token"),
  leaseExpiresAt: timestamp("lease_expires_at", { withTimezone: true }),
  failureCategory: text("failure_category"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  foreignKey({
    columns: [table.archiveCleanupTaskId],
    foreignColumns: [dataExportObjectCleanupTasks.id],
    name: "data_export_requests_cleanup_task_fk",
  }),
  index("data_export_requests_due_idx").on(table.status, table.requestedAt),
  index("data_export_requests_expiry_idx").on(table.status, table.expiresAt),
  index("data_export_requests_lease_idx").on(table.status, table.leaseExpiresAt),
  uniqueIndex("data_export_requests_one_active_per_user_unique")
    .on(table.userId)
    .where(sql`${table.status} in ('requested', 'building', 'ready')`),
  check("data_export_requests_generation_check", sql`${table.lifecycleGeneration} between 0 and 9007199254740991`),
  check("data_export_requests_id_check", sql`char_length(${table.id}) between 1 and 200`),
  check("data_export_requests_archive_key_check", sql`${table.archiveObjectKey} is null or char_length(${table.archiveObjectKey}) between 1 and 1024`),
  check("data_export_requests_failure_category_check", sql`${table.failureCategory} is null or char_length(${table.failureCategory}) between 1 and 100`),
  check("data_export_requests_lease_pair_check", sql`(${table.leaseToken} is null) = (${table.leaseExpiresAt} is null)`),
  check("data_export_requests_state_check", sql`
    (${table.status} = 'ready' and ${table.snapshotCutoffAt} is not null and ${table.archiveObjectKey} is not null and
      ${table.readyAt} is not null and ${table.expiresAt} = ${table.readyAt} + interval '24 hours' and
      ${table.archiveCleanupTaskId} is null and ${table.failureCategory} is null) or
    (${table.status} in ('requested', 'building') and ${table.snapshotCutoffAt} is null and ${table.archiveObjectKey} is null and
      ${table.readyAt} is null and ${table.expiresAt} is null and ${table.archiveCleanupTaskId} is null and ${table.failureCategory} is null) or
    (${table.status} = 'failed' and ${table.snapshotCutoffAt} is null and ${table.archiveObjectKey} is null and
      ${table.readyAt} is null and ${table.expiresAt} is null and ${table.failureCategory} is not null) or
    (${table.status} = 'cancelled' and ${table.snapshotCutoffAt} is null and ${table.archiveObjectKey} is null and
      ${table.readyAt} is null and ${table.expiresAt} is null and ${table.failureCategory} is null) or
    (${table.status} = 'expired' and ${table.snapshotCutoffAt} is null and ${table.archiveObjectKey} is null and
      ${table.readyAt} is null and ${table.expiresAt} is null and ${table.archiveCleanupTaskId} is not null and ${table.failureCategory} is null)
  `),
]);

/** Global default-off gate for the separately protected purge executor. */
export const accountPurgeOperatorControl = pgTable("account_purge_operator_control", {
  singleton: boolean("singleton").primaryKey().default(true),
  paused: boolean("paused").notNull().default(true),
  executeUntil: timestamp("execute_until", { withTimezone: true }),
  generation: bigint("generation", { mode: "number" }).notNull().default(1),
  drainState: text("drain_state").notNull().default("paused"),
  reason: text("reason").notNull().default("default_off"),
  actor: text("actor").notNull().default(sql`current_user`),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  check("account_purge_operator_control_singleton_check", sql`${table.singleton}`),
  check("account_purge_operator_control_generation_check", sql`${table.generation} > 0`),
  check("account_purge_operator_control_drain_state_check", sql`${table.drainState} in ('active', 'draining', 'paused', 'incident')`),
  check("account_purge_operator_control_reason_check", sql`char_length(${table.reason}) between 1 and 200`),
  check("account_purge_operator_control_actor_check", sql`char_length(${table.actor}) between 1 and 200`),
  check("account_purge_operator_control_state_check", sql`
    (${table.paused} and ${table.executeUntil} is null) or
    (not ${table.paused} and ${table.executeUntil} is not null
      and ${table.executeUntil} <= ${table.updatedAt} + interval '15 minutes')
  `),
]);

/** Durable evidence that a provider operation was admitted before a pause.
 * A timed-out started operation remains unresolved until operator reconciliation. */
export const accountPurgeProviderOperationPermits = pgTable("account_purge_provider_operation_permits", {
  id: text("id").primaryKey(),
  taskId: text("task_id"),
  taskIdDigest: text("task_id_digest").notNull(),
  ownerId: text("owner_id"),
  ownerIdDigest: text("owner_id_digest").notNull(),
  lifecycleGeneration: bigint("lifecycle_generation", { mode: "number" }).notNull(),
  operatorEpoch: bigint("operator_epoch", { mode: "number" }).notNull(),
  workerLeaseToken: text("worker_lease_token"),
  workerLeaseDigest: text("worker_lease_digest").notNull(),
  operation: text("operation").notNull(),
  status: text("status").notNull().default("started"),
  operationDeadline: timestamp("operation_deadline", { withTimezone: true }).notNull(),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  resolution: text("resolution"),
  reconciledActorDigest: text("reconciled_actor_digest"),
  retentionExpiresAt: timestamp("retention_expires_at", { withTimezone: true }),
}, (table) => [
  index("account_purge_provider_permits_open_idx").on(table.status, table.operationDeadline),
  check("account_purge_provider_permits_generation_check", sql`${table.lifecycleGeneration} between 1 and 9007199254740991`),
  check("account_purge_provider_permits_epoch_check", sql`${table.operatorEpoch} > 0`),
  check("account_purge_provider_permits_operation_check", sql`${table.operation} in ('delete_object', 'abort_export_multipart', 'verify_object_absent')`),
  check("account_purge_provider_permits_status_check", sql`${table.status} in ('started', 'completed', 'failed', 'unresolved', 'reconciled')`),
  check("account_purge_provider_permits_digest_check", sql`
    char_length(${table.taskIdDigest}) = 64 and char_length(${table.ownerIdDigest}) = 64
      and char_length(${table.workerLeaseDigest}) = 64
      and (${table.reconciledActorDigest} is null or char_length(${table.reconciledActorDigest}) = 64)
  `),
  check("account_purge_provider_permits_resolution_check", sql`
    (${table.status} = 'started' and ${table.taskId} is not null and ${table.ownerId} is not null
      and ${table.workerLeaseToken} is not null and ${table.resolvedAt} is null and ${table.resolution} is null
      and ${table.retentionExpiresAt} is null) or
    (${table.status} in ('completed', 'failed', 'reconciled') and ${table.taskId} is null and ${table.ownerId} is null
      and ${table.workerLeaseToken} is null and ${table.resolvedAt} is not null and ${table.resolution} is not null
      and ${table.retentionExpiresAt} = ${table.resolvedAt} + interval '30 days') or
    (${table.status} = 'unresolved' and ${table.taskId} is null and ${table.ownerId} is null
      and ${table.workerLeaseToken} is null and ${table.resolvedAt} is null and ${table.resolution} is not null
      and ${table.retentionExpiresAt} is null)
  `),
]);

/** Private per-object R2 cleanup state. It is retained until final account
 * deletion so retries cannot rediscover and re-delete a completed object. */
export const accountPurgeObjectCleanupTasks = pgTable("account_purge_object_cleanup_tasks", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  objectKey: text("object_key").notNull(),
  exportCleanupTaskId: text("export_cleanup_task_id").references(() => dataExportObjectCleanupTasks.id),
  status: accountPurgeObjectCleanupStatus("status").notNull().default("pending"),
  attemptCount: bigint("attempt_count", { mode: "number" }).notNull().default(0),
  nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }).defaultNow(),
  leaseToken: text("lease_token"),
  leaseExpiresAt: timestamp("lease_expires_at", { withTimezone: true }),
  failureCategory: text("failure_category"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
}, (table) => [
  unique("account_purge_object_cleanup_tasks_user_key_unique").on(table.userId, table.objectKey),
  index("account_purge_object_cleanup_tasks_due_idx").on(table.status, table.nextAttemptAt),
  index("account_purge_object_cleanup_tasks_lease_idx").on(table.status, table.leaseExpiresAt),
  check("account_purge_object_cleanup_tasks_id_check", sql`char_length(${table.id}) between 1 and 200`),
  check("account_purge_object_cleanup_tasks_key_check", sql`char_length(${table.objectKey}) between 1 and 1024`),
  check("account_purge_object_cleanup_tasks_attempt_check", sql`${table.attemptCount} >= 0`),
  check("account_purge_object_cleanup_tasks_failure_check", sql`${table.failureCategory} is null or char_length(${table.failureCategory}) between 1 and 100`),
  check("account_purge_object_cleanup_tasks_lease_pair_check", sql`(${table.leaseToken} is null) = (${table.leaseExpiresAt} is null)`),
  check("account_purge_object_cleanup_tasks_state_check", sql`
    (${table.status} = 'pending' and ${table.leaseToken} is null and ${table.failureCategory} is null) or
    (${table.status} = 'deleting' and ${table.leaseToken} is not null and ${table.nextAttemptAt} is null and ${table.failureCategory} is null) or
    (${table.status} = 'failed' and ${table.leaseToken} is null and ${table.failureCategory} is not null) or
    (${table.status} = 'completed' and ${table.leaseToken} is null and ${table.failureCategory} is null and ${table.completedAt} is not null)
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
  check("account_purge_receipts_expiry_check", sql`${table.expiresAt} = ${table.completedAt} + interval '720 hours'`),
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
