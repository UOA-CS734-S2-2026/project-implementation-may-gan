import {
  bigint,
  check,
  date,
  foreignKey,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { dailyPrompts } from "./daily-prompts";
import { friendRequests, friendships, relationshipBlocks, relationshipSearchQuota } from "./relationships";
import {
  conversationChanges,
  conversationMembers,
  conversations,
  messageReactions,
  messagingParticipants,
  messages,
  messagingOutbox,
  pushDevices,
  socketTickets,
} from "./messaging";
import {
  accountLifecycles,
  accountManagementGrants,
  accountPurgeObjectCleanupTasks,
  accountPurgeReceipts,
  dataExportCleanupIncidents,
  dataExportObjectCleanupTasks,
  dataExportRequests,
  operatorCases,
} from "./lifecycle";
import {
  ageDeclarations,
  legalDocumentVersions,
  registrationIntents,
  termsAcceptances,
} from "./legal";
import { user, usernameReservations } from "./users";
import { futureSelfNoteDeliveries, futureSelfNoteIdempotencyKeys, futureSelfNotes } from "./future-self-notes";
import { accountGoogleReauthenticationIntents } from "./google-reauth";
import {
  accountNotificationPreferences,
  notificationDeliveries,
  notificationEvents,
} from "./notifications";

export { profileVisibility, tier, user, usernameReservations } from "./users";

/**
 * Legacy profile values remain nullable for new Better Auth registrations.
 * Import work will preserve their existing values and stable text user IDs.
 */
export const postAudience = pgEnum("post_audience", ["solo", "friends"]);

export const mediaReservationStatus = pgEnum("media_reservation_status", [
  "pending",
  "validated",
  "failed",
]);

/**
 * "object_not_found" is written only for a rare TOCTOU case (the object existed at
 * a HEAD check but vanished before a following read). The common case — the client
 * simply hasn't finished the PUT yet — is a transient, retryable condition and is
 * never persisted at all. See apps/api/src/features/media/complete/complete.service.ts.
 */
export const mediaValidationFailureReason = pgEnum("media_validation_failure_reason", [
  "byte_size_mismatch",
  "format_mismatch",
  "duration_exceeded",
  "malformed_container",
  "object_not_found",
]);

export const session = pgTable("session", {
  id: text("id").primaryKey(),
  expiresAt: timestamp("expires_at").notNull(),
  token: text("token").notNull().unique(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().$onUpdate(() => new Date()).notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
}, (table) => [index("session_user_id_idx").on(table.userId)]);

export const account = pgTable("account", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at"),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
  scope: text("scope"),
  password: text("password"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().$onUpdate(() => new Date()).notNull(),
}, (table) => [
  index("account_user_id_idx").on(table.userId),
  unique("account_provider_id_account_id_unique").on(table.providerId, table.accountId),
]);

/** A short-lived, single-use password confirmation for browser OAuth linking. */
export const socialLinkConfirmation = pgTable("social_link_confirmation", {
  stateDigest: text("state_digest").primaryKey(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  sessionId: text("session_id").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  consumedAt: timestamp("consumed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [index("social_link_confirmation_user_expires_at_idx").on(table.userId, table.expiresAt)]);

export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().$onUpdate(() => new Date()).notNull(),
}, (table) => [index("verification_identifier_idx").on(table.identifier)]);

/** Persistent Better Auth rate limiting shared across Worker isolates. */
export const rateLimit = pgTable("rateLimit", {
  id: text("id").primaryKey(),
  key: text("key").notNull().unique(),
  count: integer("count").notNull(),
  lastRequest: bigint("last_request", { mode: "number" }).notNull(),
});

/** One weather snapshot per post, set when the post is created. All three
 * columns are present or all absent, and no coordinates are ever stored. The
 * condition set mirrors the API contract in @dayli/contracts. */
export const WEATHER_CONDITIONS = ["clear", "partly_cloudy", "cloudy", "fog", "drizzle", "rain", "snow", "thunderstorm"] as const;
export const WEATHER_TEMPERATURE_MIN_C = -90;
export const WEATHER_TEMPERATURE_MAX_C = 60;
export const WEATHER_PLACE_NAME_MAX_CODE_POINTS = 80;

/**
 * A post is one accepted response for one author and Auckland calendar day.
 * Once accepted, localDate is immutable because tomorrow-note availability is
 * derived from it. Audience is deliberately required without a default so
 * legacy imports cannot silently acquire a visibility policy.
 */
export const posts = pgTable("posts", {
  id: text("id").primaryKey(),
  authorId: text("author_id").notNull().references(() => user.id),
  localDate: date("local_date", { mode: "string" }).notNull(),
  promptId: text("prompt_id").notNull().references(() => dailyPrompts.id),
  reflectiveAnswer: text("reflective_answer").notNull(),
  caption: text("caption"),
  rating: integer("rating").notNull(),
  audience: postAudience("audience").notNull(),
  weatherCondition: text("weather_condition"),
  weatherTemperatureC: bigint("weather_temperature_c", { mode: "number" }),
  weatherPlaceName: text("weather_place_name"),
  acceptedAt: timestamp("accepted_at", { withTimezone: true }).notNull(),
  releasedAt: timestamp("released_at", { withTimezone: true }).notNull(),
  trashedAt: timestamp("trashed_at", { withTimezone: true }),
  restoreUntil: timestamp("restore_until", { withTimezone: true }),
  trashPurgeDueAt: timestamp("trash_purge_due_at", { withTimezone: true }),
  trashGeneration: bigint("trash_generation", { mode: "number" }).notNull().default(0),
  trashLeaseToken: text("trash_lease_token"),
  trashLeaseExpiresAt: timestamp("trash_lease_expires_at", { withTimezone: true }),
  trashFailureCategory: text("trash_failure_category"),
  trashNextAttemptAt: timestamp("trash_next_attempt_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex("posts_author_local_date_active_unique")
    .on(table.authorId, table.localDate)
    .where(sql`${table.trashedAt} is null`),
  unique("posts_id_author_unique").on(table.id, table.authorId),
  check("posts_rating_check", sql`${table.rating} between 1 and 10`),
  check(
    "posts_reflective_answer_length_check",
    sql`char_length(${table.reflectiveAnswer}) between 1 and 4000 and ${table.reflectiveAnswer} = btrim(${table.reflectiveAnswer})`,
  ),
  check(
    "posts_caption_length_check",
    sql`${table.caption} is null or char_length(${table.caption}) <= 1000`,
  ),
  check("posts_release_after_acceptance_check", sql`${table.releasedAt} > ${table.acceptedAt}`),
  check("posts_weather_presence_check", sql`
    (${table.weatherCondition} is null) = (${table.weatherTemperatureC} is null) and
    (${table.weatherCondition} is null) = (${table.weatherPlaceName} is null)
  `),
  check("posts_weather_condition_check", sql`${table.weatherCondition} is null or ${table.weatherCondition} in (${sql.raw(WEATHER_CONDITIONS.map((condition) => `'${condition}'`).join(", "))})`),
  check("posts_weather_temperature_check", sql`${table.weatherTemperatureC} is null or ${table.weatherTemperatureC} between ${sql.raw(String(WEATHER_TEMPERATURE_MIN_C))} and ${sql.raw(String(WEATHER_TEMPERATURE_MAX_C))}`),
  check(
    "posts_weather_place_name_check",
    sql`${table.weatherPlaceName} is null or (char_length(${table.weatherPlaceName}) between 1 and ${sql.raw(String(WEATHER_PLACE_NAME_MAX_CODE_POINTS))} and ${table.weatherPlaceName} = btrim(${table.weatherPlaceName}) and ${table.weatherPlaceName} !~ '[[:cntrl:]]')`,
  ),
  check("posts_trash_generation_check", sql`${table.trashGeneration} between 0 and 9007199254740991`),
  check("posts_trash_deadlines_check", sql`
    (${table.trashedAt} is null and ${table.restoreUntil} is null and ${table.trashPurgeDueAt} is null and
      ${table.trashLeaseToken} is null and ${table.trashLeaseExpiresAt} is null and
      ${table.trashFailureCategory} is null and ${table.trashNextAttemptAt} is null) or
    (${table.trashedAt} is not null and ${table.restoreUntil} = ${table.trashedAt} + interval '168 hours' and
      ${table.trashPurgeDueAt} = ${table.trashedAt} + interval '336 hours')
  `),
  check("posts_trash_deadline_presence_check", sql`${table.trashedAt} is null or (${table.restoreUntil} is not null and ${table.trashPurgeDueAt} is not null)`),
  check("posts_trash_lease_pair_check", sql`(${table.trashLeaseToken} is null) = (${table.trashLeaseExpiresAt} is null)`),
  check("posts_trash_failure_category_check", sql`${table.trashFailureCategory} is null or char_length(${table.trashFailureCategory}) between 1 and 100`),
]);

/** Rows in this table represent accepted attachments only; download
 * authorization and cleanup belong to the later media issues.
 * postId and id ownership are immutable at the database level because revisions
 * retain historical media IDs in JSON metadata. Removal is represented by
 * detachedAt; post_media rows must never be physically deleted.
 *
 * reservationId names the validated upload whose object holds the bytes; legacy
 * imports have none. Each upload attaches at most once, even after detaching,
 * and RESTRICT stops reservation cleanup from deleting one a post still uses. */
export const postMedia = pgTable("post_media", {
  id: text("id").primaryKey(),
  postId: text("post_id").notNull().references(() => posts.id),
  attachmentOrder: integer("attachment_order").notNull(),
  reservationId: text("reservation_id").references(() => mediaReservation.id, { onDelete: "restrict" }),
  acceptedAt: timestamp("accepted_at", { withTimezone: true }).defaultNow().notNull(),
  detachedAt: timestamp("detached_at", { withTimezone: true }),
}, (table) => [
  uniqueIndex("post_media_active_post_order_unique")
    .on(table.postId, table.attachmentOrder)
    .where(sql`${table.detachedAt} is null`),
  uniqueIndex("post_media_reservation_unique")
    .on(table.reservationId)
    .where(sql`${table.reservationId} is not null`),
  check("post_media_attachment_order_check", sql`${table.attachmentOrder} >= 0`),
]);

/** Legacy-only Cloudinary identifiers and URLs. A URL here is provenance
 * metadata, never an authorization or serving grant. */
export const legacyCloudinaryMedia = pgTable("legacy_cloudinary_media", {
  mediaId: text("media_id").primaryKey().references(() => postMedia.id),
  cloudinaryPublicId: text("cloudinary_public_id").notNull(),
  cloudinaryUrl: text("cloudinary_url").notNull(),
  legacyType: text("legacy_type"),
});

/**
 * Revisions capture the complete prior post projection. Attachment refs are a
 * JSON metadata snapshot rather than a serving relation, so a removed media
 * row can remain historically describable without retaining byte access.
 */
export const postRevisions = pgTable("post_revisions", {
  id: text("id").primaryKey(),
  postId: text("post_id").notNull().references(() => posts.id),
  revisionNumber: integer("revision_number").notNull(),
  previousReflectiveAnswer: text("previous_reflective_answer").notNull(),
  previousCaption: text("previous_caption"),
  previousRating: integer("previous_rating").notNull(),
  previousAudience: postAudience("previous_audience").notNull(),
  previousPromptId: text("previous_prompt_id").notNull().references(() => dailyPrompts.id),
  previousAttachmentRefs: jsonb("previous_attachment_refs").$type<ReadonlyArray<{
    media_id: string;
    attachment_order: number;
    status: "attached" | "detached";
  }>>().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  unique("post_revisions_post_number_unique").on(table.postId, table.revisionNumber),
  check("post_revisions_revision_number_check", sql`${table.revisionNumber} > 0`),
  check("post_revisions_previous_rating_check", sql`${table.previousRating} between 1 and 10`),
  check(
    "post_revisions_previous_answer_length_check",
    sql`char_length(${table.previousReflectiveAnswer}) between 1 and 4000 and ${table.previousReflectiveAnswer} = btrim(${table.previousReflectiveAnswer})`,
  ),
  check(
    "post_revisions_previous_caption_length_check",
    sql`${table.previousCaption} is null or char_length(${table.previousCaption}) <= 1000`,
  ),
  check(
    "post_revisions_attachment_refs_array_check",
    sql`public.dayli_attachment_refs_valid(${table.previousAttachmentRefs})`,
  ),
]);

/**
 * One like per person per post. Access is checked against the post on every
 * read and write, so a like never outlives the liker's access in any view.
 * Likes go with their post when Trash cleanup purges it.
 */
export const postLikes = pgTable("post_likes", {
  postId: text("post_id").notNull().references(() => posts.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => user.id),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  primaryKey({ name: "post_likes_pkey", columns: [table.postId, table.userId] }),
  // Matches the likers list: one post, newest first, user_id as tie-breaker.
  index("post_likes_post_created_idx").on(table.postId, table.createdAt, table.userId),
  index("post_likes_user_id_idx").on(table.userId),
]);

/**
 * Comments and one level of replies. A reply's parent is a comment on the same
 * post, enforced by the composite key. clientCommentId makes a retried create
 * return the comment it already made. Deletion is a soft delete that also
 * hides the replies of a deleted top-level comment. Comments go with their
 * post when Trash cleanup purges it.
 */
export const postComments = pgTable("post_comments", {
  id: text("id").primaryKey(),
  postId: text("post_id").notNull().references(() => posts.id, { onDelete: "cascade" }),
  authorId: text("author_id").notNull().references(() => user.id),
  parentCommentId: text("parent_comment_id"),
  clientCommentId: text("client_comment_id").notNull(),
  body: text("body").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  editedAt: timestamp("edited_at", { withTimezone: true }),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
  deletedBy: text("deleted_by").references(() => user.id),
}, (table) => [
  unique("post_comments_post_id_id_unique").on(table.postId, table.id),
  unique("post_comments_author_client_comment_unique").on(table.authorId, table.clientCommentId),
  foreignKey({
    name: "post_comments_parent_same_post_fk",
    columns: [table.postId, table.parentCommentId],
    foreignColumns: [table.postId, table.id],
  }).onDelete("cascade"),
  index("post_comments_post_created_idx").on(table.postId, table.createdAt, table.id),
  index("post_comments_author_id_idx").on(table.authorId),
  check("post_comments_not_own_parent_check", sql`${table.parentCommentId} is null or ${table.parentCommentId} <> ${table.id}`),
  check(
    "post_comments_body_length_check",
    sql`char_length(${table.body}) between 1 and 1000 and ${table.body} = btrim(${table.body})`,
  ),
  check(
    "post_comments_client_comment_id_length_check",
    sql`char_length(${table.clientCommentId}) between 1 and 255`,
  ),
  check(
    "post_comments_deleted_by_check",
    sql`(${table.deletedAt} is null) = (${table.deletedBy} is null)`,
  ),
]);

/**
 * Tomorrow notes intentionally live outside post and revision projections.
 * availableOn is the first Auckland date on which the author may read it;
 * application authorization must still require that author identity.
 */
export const tomorrowNotes = pgTable("tomorrow_notes", {
  id: text("id").primaryKey(),
  postId: text("post_id").notNull().unique().references(() => posts.id),
  authorId: text("author_id").notNull().references(() => user.id),
  note: text("note").notNull(),
  submittedAt: timestamp("submitted_at", { withTimezone: true }).defaultNow().notNull(),
  availableOn: date("available_on", { mode: "string" }).notNull(),
}, (table) => [
  foreignKey({
    columns: [table.postId, table.authorId],
    foreignColumns: [posts.id, posts.authorId],
    name: "tomorrow_notes_post_author_fk",
  }),
  check(
    "tomorrow_notes_length_check",
    sql`char_length(${table.note}) between 1 and 1000`,
  ),
]);

/**
 * The accepted outcome of a retriable daily-post submission. The fingerprint is
 * a SHA-256 of the normalized request, so an identical retry replays the
 * stored post while reusing the key with different content conflicts. Only
 * accepted submissions are recorded; a rejected attempt can be retried with
 * the same key. Rows follow their post and author through deletion cleanup.
 */
export const postIdempotencyKeys = pgTable("post_idempotency_keys", {
  authorId: text("author_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  idempotencyKey: text("idempotency_key").notNull(),
  requestFingerprint: text("request_fingerprint").notNull(),
  postId: text("post_id").notNull().references(() => posts.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  primaryKey({ name: "post_idempotency_keys_pk", columns: [table.authorId, table.idempotencyKey] }),
  index("post_idempotency_keys_post_id_idx").on(table.postId),
  check(
    "post_idempotency_keys_key_check",
    sql`char_length(${table.idempotencyKey}) between 1 and 255`,
  ),
  check(
    "post_idempotency_keys_fingerprint_check",
    sql`${table.requestFingerprint} ~ '^[0-9a-f]{64}$'`,
  ),
]);

/**
 * An owned, opaque R2 object path reserved before a direct client upload.
 * status/failureReason/validatedAt record the outcome of issue #23's completion
 * check (verifying the real uploaded object's ownership/bytes/format/duration) —
 * the check constraint below enforces that exactly one of the three (status,
 * failureReason, validatedAt) combinations ever exists for a row.
 */
export const mediaReservation = pgTable("media_reservation", {
  id: text("id").primaryKey(),
  ownerId: text("owner_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  objectKey: text("object_key").notNull().unique(),
  contentType: text("content_type").notNull(),
  byteSize: bigint("byte_size", { mode: "number" }).notNull(),
  status: mediaReservationStatus("status").default("pending").notNull(),
  failureReason: mediaValidationFailureReason("failure_reason"),
  validatedAt: timestamp("validated_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  /** Set once, under the row lock, when cleanup claims the upload. A claimed
   * upload can never be attached, completed, or served again. */
  cleanupClaimedAt: timestamp("cleanup_claimed_at", { withTimezone: true }),
  cleanupLeaseToken: text("cleanup_lease_token"),
  cleanupLeaseExpiresAt: timestamp("cleanup_lease_expires_at", { withTimezone: true }),
  cleanupAttempts: bigint("cleanup_attempts", { mode: "number" }).default(0).notNull(),
  cleanupAvailableAt: timestamp("cleanup_available_at", { withTimezone: true }),
}, (table) => [
  index("media_reservation_owner_id_expires_at_idx").on(table.ownerId, table.expiresAt),
  index("media_reservation_cleanup_candidate_idx").on(table.expiresAt).where(sql`${table.cleanupClaimedAt} is null`),
  // Matches the retry query's coalesce exactly. A row with neither timestamp (an
  // exhausted one) has no entry, so the index only holds work that can still run.
  index("media_reservation_cleanup_retry_idx")
    .on(sql`coalesce(${table.cleanupLeaseExpiresAt}, ${table.cleanupAvailableAt})`)
    .where(sql`${table.cleanupClaimedAt} is not null and coalesce(${table.cleanupLeaseExpiresAt}, ${table.cleanupAvailableAt}) is not null`),
  check("media_reservation_status_consistency_check", sql`
    (${table.status} = 'pending' and ${table.failureReason} is null and ${table.validatedAt} is null) or
    (${table.status} = 'validated' and ${table.failureReason} is null and ${table.validatedAt} is not null) or
    (${table.status} = 'failed' and ${table.failureReason} is not null and ${table.validatedAt} is not null)
  `),
]);

/**
 * A profile photo: one validated upload per account. The row goes when the
 * owner removes the photo; the object itself is left for upload cleanup.
 */
export const profileAvatars = pgTable("profile_avatars", {
  userId: text("user_id").primaryKey().references(() => user.id, { onDelete: "cascade" }),
  reservationId: text("reservation_id").notNull().unique().references(() => mediaReservation.id, { onDelete: "cascade" }),
  setAt: timestamp("set_at", { withTimezone: true }).defaultNow().notNull(),
});

export { dailyPrompts } from "./daily-prompts";
export {
  conversationChanges,
  conversationKind,
  conversationMembers,
  conversations,
  messageReactions,
  messagingParticipantState,
  messagingParticipants,
  messageRequestState,
  messages,
  messagingOutbox,
  messagingOutboxChannel,
  messagingOutboxStatus,
  pushDevices,
  pushPlatform,
  socketTickets,
} from "./messaging";

export {
  friendRequestStatus,
  friendRequests,
  friendships,
  friendshipState,
  relationshipBlocks,
  relationshipSearchQuota,
} from "./relationships";

export { accountGoogleReauthenticationIntents } from "./google-reauth";

export {
  accountNotificationPreferences,
  notificationDeliveries,
  notificationDeliveryStatus,
  notificationEvents,
  notificationKind,
} from "./notifications";

export {
  futureSelfNoteDeliveries,
  futureSelfNoteDeliveryStatus,
  futureSelfNoteIdempotencyKeys,
  futureSelfNoteStatus,
  futureSelfNotes,
} from "./future-self-notes";

export {
  accountLifecycleState,
  accountLifecycles,
  accountManagementGrantAction,
  accountManagementGrants,
  accountPurgeObjectCleanupStatus,
  accountPurgeObjectCleanupTasks,
  accountPurgeReceipts,
  dataExportObjectCleanupStatus,
  dataExportCleanupIncidents,
  dataExportObjectCleanupTasks,
  dataExportRequests,
  dataExportStatus,
  operatorCaseDecision,
  operatorCaseStatus,
  operatorCaseType,
  operatorCases,
  purgeReceiptOutcome,
} from "./lifecycle";

export {
  ageDeclarations,
  legalDocumentKind,
  legalDocumentStatus,
  legalDocumentVersions,
  registrationIntents,
  termsAcceptances,
} from "./legal";

export const schema = {
  account,
  accountGoogleReauthenticationIntents,
  accountLifecycles,
  accountManagementGrants,
  accountNotificationPreferences,
  accountPurgeObjectCleanupTasks,
  accountPurgeReceipts,
  ageDeclarations,
  conversationChanges,
  conversationMembers,
  conversations,
  dataExportCleanupIncidents,
  dataExportObjectCleanupTasks,
  dataExportRequests,
  dailyPrompts,
  friendRequests,
  friendships,
  futureSelfNoteDeliveries,
  futureSelfNoteIdempotencyKeys,
  futureSelfNotes,
  legalDocumentVersions,
  legacyCloudinaryMedia,
  mediaReservation,
  messageReactions,
  messagingParticipants,
  messages,
  messagingOutbox,
  notificationDeliveries,
  notificationEvents,
  operatorCases,
  postComments,
  postIdempotencyKeys,
  postLikes,
  postMedia,
  postRevisions,
  posts,
  profileAvatars,
  pushDevices,
  rateLimit,
  registrationIntents,
  relationshipBlocks,
  relationshipSearchQuota,
  session,
  socialLinkConfirmation,
  socketTickets,
  termsAcceptances,
  tomorrowNotes,
  user,
  usernameReservations,
  verification,
};
