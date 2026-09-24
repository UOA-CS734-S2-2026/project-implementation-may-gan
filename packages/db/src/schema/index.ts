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
  text,
  timestamp,
  unique,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { dailyPrompts } from "./daily-prompts";
import { friendRequests, friendships, relationshipBlocks } from "./relationships";
import { user } from "./users";

export { profileVisibility, tier, user } from "./users";

/**
 * Legacy profile values remain nullable for new Better Auth registrations.
 * Import work will preserve their existing values and stable text user IDs.
 */
export const postAudience = pgEnum("post_audience", ["solo", "friends"]);

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
}, (table) => [index("account_user_id_idx").on(table.userId)]);

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
  acceptedAt: timestamp("accepted_at", { withTimezone: true }).notNull(),
  releasedAt: timestamp("released_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  unique("posts_author_local_date_unique").on(table.authorId, table.localDate),
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
]);

/** Rows in this table represent accepted attachments only; upload reservation,
 * validation, authorization, and cleanup belong to the later media issues.
 * postId and id ownership are immutable at the database level because revisions
 * retain historical media IDs in JSON metadata. Removal is represented by
 * detachedAt; post_media rows must never be physically deleted. */
export const postMedia = pgTable("post_media", {
  id: text("id").primaryKey(),
  postId: text("post_id").notNull().references(() => posts.id),
  attachmentOrder: integer("attachment_order").notNull(),
  acceptedAt: timestamp("accepted_at", { withTimezone: true }).defaultNow().notNull(),
  detachedAt: timestamp("detached_at", { withTimezone: true }),
}, (table) => [
  uniqueIndex("post_media_active_post_order_unique")
    .on(table.postId, table.attachmentOrder)
    .where(sql`${table.detachedAt} is null`),
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

export { dailyPrompts } from "./daily-prompts";

export {
  friendRequestStatus,
  friendRequests,
  friendships,
  friendshipState,
  relationshipBlocks,
} from "./relationships";

export const schema = {
  account,
  dailyPrompts,
  friendRequests,
  friendships,
  legacyCloudinaryMedia,
  postMedia,
  postRevisions,
  posts,
  rateLimit,
  relationshipBlocks,
  session,
  tomorrowNotes,
  user,
  verification,
};
