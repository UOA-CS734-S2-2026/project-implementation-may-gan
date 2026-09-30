-- Correct unpublished legal metadata rules without imposing a retroactive
-- publication record on an already populated upgrade.
-- squawk-ignore-file require-lock-timeout
-- squawk-ignore-file require-statement-timeout
-- squawk-ignore-file constraint-missing-not-valid
-- squawk-ignore-file prefer-robust-stmts
SET lock_timeout = '5s';--> statement-breakpoint
SET statement_timeout = '5min';--> statement-breakpoint
ALTER TABLE "legal_document_versions" DROP CONSTRAINT "legal_document_versions_material_notice_check";--> statement-breakpoint
ALTER TABLE "legal_document_versions" DROP CONSTRAINT "legal_document_versions_urgent_reason_check";--> statement-breakpoint
ALTER TABLE "legal_document_versions" ADD CONSTRAINT "legal_document_versions_material_publication_check" CHECK (
    not "legal_document_versions"."material_change" or "legal_document_versions"."status" not in ('notice', 'effective') or
    "legal_document_versions"."urgent_change_reason" is not null or
    ("legal_document_versions"."notice_starts_at" is not null and "legal_document_versions"."effective_at" >= "legal_document_versions"."notice_starts_at" + interval '30 days')
  ) NOT VALID;--> statement-breakpoint
ALTER TABLE "legal_document_versions" ADD CONSTRAINT "legal_document_versions_urgent_reason_check" CHECK ("legal_document_versions"."urgent_change_reason" is null or ("legal_document_versions"."urgent_change_reason" = btrim("legal_document_versions"."urgent_change_reason") and char_length("legal_document_versions"."urgent_change_reason") between 1 and 500)) NOT VALID;