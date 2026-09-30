import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  foreignKey,
  index,
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";
import { user } from "./users";

export const legalDocumentKind = pgEnum("legal_document_kind", ["terms", "privacy_policy"]);
export const legalDocumentStatus = pgEnum("legal_document_status", ["draft", "notice", "effective", "superseded"]);

/**
 * Server-owned document metadata. Policy display is not consent, and no draft
 * or effective version is seeded by this migration.
 */
export const legalDocumentVersions = pgTable("legal_document_versions", {
  id: text("id").primaryKey(),
  kind: legalDocumentKind("kind").notNull(),
  version: integer("version").notNull(),
  contentDigest: text("content_digest").notNull(),
  status: legalDocumentStatus("status").notNull().default("draft"),
  materialChange: boolean("material_change").notNull().default(false),
  noticeStartsAt: timestamp("notice_starts_at", { withTimezone: true }),
  effectiveAt: timestamp("effective_at", { withTimezone: true }),
  urgentChangeReason: text("urgent_change_reason"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  unique("legal_document_versions_kind_version_unique").on(table.kind, table.version),
  index("legal_document_versions_current_idx").on(table.kind, table.status, table.effectiveAt),
  check("legal_document_versions_id_check", sql`char_length(${table.id}) between 1 and 200`),
  check("legal_document_versions_version_check", sql`${table.version} > 0`),
  check("legal_document_versions_content_digest_check", sql`${table.contentDigest} ~ '^[0-9a-f]{64}$'`),
  check("legal_document_versions_urgent_reason_check", sql`${table.urgentChangeReason} is null or char_length(${table.urgentChangeReason}) between 1 and 500`),
  check("legal_document_versions_status_check", sql`
    (${table.status} = 'draft' and ${table.noticeStartsAt} is null and ${table.effectiveAt} is null and ${table.urgentChangeReason} is null) or
    (${table.status} = 'notice' and ${table.noticeStartsAt} is not null and ${table.effectiveAt} is not null and ${table.noticeStartsAt} < ${table.effectiveAt}) or
    (${table.status} = 'effective' and ${table.effectiveAt} is not null) or
    (${table.status} = 'superseded' and ${table.effectiveAt} is not null)
  `),
  check("legal_document_versions_urgent_change_check", sql`
    ${table.urgentChangeReason} is null or
    (${table.materialChange} and ${table.noticeStartsAt} is not null and ${table.effectiveAt} is not null and ${table.noticeStartsAt} < ${table.effectiveAt})
  `),
]);

/** Explicit Terms acceptance. Privacy Policy display never writes this table. */
export const termsAcceptances = pgTable("terms_acceptances", {
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  termsVersionId: text("terms_version_id").notNull(),
  acceptedAt: timestamp("accepted_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  foreignKey({
    columns: [table.termsVersionId],
    foreignColumns: [legalDocumentVersions.id],
    name: "terms_acceptances_terms_version_fk",
  }),
  primaryKey({ name: "terms_acceptances_pk", columns: [table.userId, table.termsVersionId] }),
  index("terms_acceptances_terms_version_idx").on(table.termsVersionId),
]);

/** The age declaration is distinct from Terms acceptance and stores no birthday. */
export const ageDeclarations = pgTable("age_declarations", {
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  declarationVersion: text("declaration_version").notNull(),
  declaredAt: timestamp("declared_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  primaryKey({ name: "age_declarations_pk", columns: [table.userId, table.declarationVersion] }),
  check("age_declarations_version_check", sql`char_length(${table.declarationVersion}) between 1 and 200`),
]);

/**
 * A short-lived server-issued registration intent. The client receives only an
 * opaque token; this record stores its digest and the presented Terms version.
 */
export const registrationIntents = pgTable("registration_intents", {
  tokenDigest: text("token_digest").primaryKey(),
  termsVersionId: text("terms_version_id").notNull(),
  ageDeclarationVersion: text("age_declaration_version").notNull(),
  flowBindingDigest: text("flow_binding_digest").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  consumedAt: timestamp("consumed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  foreignKey({
    columns: [table.termsVersionId],
    foreignColumns: [legalDocumentVersions.id],
    name: "registration_intents_terms_version_fk",
  }),
  index("registration_intents_expiry_idx").on(table.expiresAt),
  index("registration_intents_terms_version_idx").on(table.termsVersionId),
  check("registration_intents_token_digest_check", sql`${table.tokenDigest} ~ '^[0-9a-f]{64}$'`),
  check("registration_intents_flow_binding_digest_check", sql`${table.flowBindingDigest} ~ '^[0-9a-f]{64}$'`),
  check("registration_intents_age_declaration_version_check", sql`char_length(${table.ageDeclarationVersion}) between 1 and 200`),
  check("registration_intents_expiry_check", sql`${table.expiresAt} > ${table.createdAt}`),
  check("registration_intents_consumed_check", sql`${table.consumedAt} is null or ${table.consumedAt} <= ${table.expiresAt}`),
]);
